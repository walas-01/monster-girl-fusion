import { afterEach, describe, expect, it, vi } from "vitest";

import {
    createPlayer,
    fuseMonsters,
    getMonsterInfoById,
    getPlayerByUuid,
    getPlayerMonsters
} from "./api.js";

const PLAYER_UUID = "123e4567-e89b-42d3-a456-426614174000";

function player(overrides = {}) {
    return {
        id: 1,
        uuid: PLAYER_UUID,
        username: "Ada",
        monster_slots: 10,
        wood: 0,
        stone: 0,
        food: 0,
        ...overrides
    };
}

function monster(overrides = {}) {
    return {
        id: 1,
        name: "slime",
        display_name: "Slime",
        image_path: "monsters/slime.png",
        type: "water",
        tier: 0,
        nickname: null,
        max_hp: 10,
        atk: 2,
        spd: 3,
        aim: 4,
        owner_id: 1,
        ...overrides
    };
}

function recipeParent(overrides = {}) {
    return {
        display_name: "Slime",
        image_path: "monsters/slime.png",
        tier: 0,
        ...overrides
    };
}

function jsonResponse(body, { status = 200, headers = {} } = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...headers
        }
    });
}

function mockResponse(response) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

function expectInvalidResponse(request) {
    return expect(request).rejects.toMatchObject({
        message: "Invalid response from server",
        status: 200
    });
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("API response parsing", () => {
    it("returns valid JSON success responses", async () => {
        mockResponse(jsonResponse({ player: player() }));

        await expect(getPlayerByUuid(PLAYER_UUID)).resolves.toEqual({ player: player() });
    });

    it("preserves JSON error messages, status, and request IDs", async () => {
        mockResponse(jsonResponse(
            { message: "Player not found" },
            { status: 404, headers: { "X-Request-ID": "request-123" } }
        ));

        await expect(getPlayerByUuid(PLAYER_UUID)).rejects.toMatchObject({
            message: "Player not found",
            status: 404,
            requestId: "request-123"
        });
    });

    it("uses the endpoint fallback for non-JSON failures", async () => {
        mockResponse(new Response("gateway unavailable", { status: 502 }));

        await expect(getPlayerMonsters(PLAYER_UUID)).rejects.toMatchObject({
            message: "Failed to get monsters",
            status: 502
        });
    });

    it("rejects non-JSON successful responses", async () => {
        mockResponse(new Response("not json", {
            status: 200,
            headers: { "X-Request-ID": "request-456" }
        }));

        await expect(getPlayerMonsters(PLAYER_UUID)).rejects.toMatchObject({
            message: "Invalid JSON response",
            status: 200,
            requestId: "request-456"
        });
    });
});

describe("endpoint response contracts", () => {
    it("accepts a complete created player", async () => {
        const createdPlayer = player();
        delete createdPlayer.monster_slots;
        delete createdPlayer.wood;
        delete createdPlayer.stone;
        delete createdPlayer.food;
        mockResponse(jsonResponse({ player: createdPlayer }, { status: 201 }));

        await expect(createPlayer("Ada")).resolves.toEqual({ player: createdPlayer });
    });

    it("marks malformed successful creation responses as uncertain", async () => {
        mockResponse(jsonResponse({ player: player({ uuid: "invalid" }) }, { status: 201 }));

        await expect(createPlayer("Ada")).rejects.toMatchObject({
            status: 201,
            uncertain: true
        });
    });

    it.each([
        ["id", 0],
        ["uuid", "not-a-uuid"],
        ["username", " "]
    ])("rejects a created player with invalid %s", async (field, value) => {
        const createdPlayer = player({ [field]: value });
        delete createdPlayer.monster_slots;
        delete createdPlayer.wood;
        delete createdPlayer.stone;
        delete createdPlayer.food;
        mockResponse(jsonResponse({ player: createdPlayer }));

        await expectInvalidResponse(createPlayer("Ada"));
    });

    it.each([
        ["id", 1.5],
        ["uuid", "invalid"],
        ["username", ""],
        ["monster_slots", -1],
        ["wood", 1.5],
        ["stone", null],
        ["food", "0"]
    ])("rejects a restored player with invalid %s", async (field, value) => {
        mockResponse(jsonResponse({ player: player({ [field]: value }) }));

        await expectInvalidResponse(getPlayerByUuid(PLAYER_UUID));
    });

    it("requires the restored UUID to match the request after canonicalization", async () => {
        const otherUuid = "123e4567-e89b-42d3-a456-426614174001";
        mockResponse(jsonResponse({ player: player({ uuid: otherUuid }) }));

        await expectInvalidResponse(getPlayerByUuid(PLAYER_UUID.toUpperCase()));
    });

    it("accepts an uppercase requested UUID for a canonical response", async () => {
        mockResponse(jsonResponse({ player: player() }));

        await expect(getPlayerByUuid(PLAYER_UUID.toUpperCase())).resolves.toEqual({ player: player() });
    });

    it("accepts a complete collection and matching count", async () => {
        const body = { monsters_found: 1, monsters: [monster()] };
        mockResponse(jsonResponse(body));

        await expect(getPlayerMonsters(PLAYER_UUID)).resolves.toEqual(body);
    });

    it.each([
        ["id", 0],
        ["name", ""],
        ["display_name", " "],
        ["image_path", null],
        ["type", ""],
        ["tier", -1],
        ["nickname", 2],
        ["max_hp", 0],
        ["atk", 1.5],
        ["spd", -1],
        ["aim", "4"],
        ["owner_id", 0]
    ])("rejects a collection monster with invalid %s", async (field, value) => {
        mockResponse(jsonResponse({
            monsters_found: 1,
            monsters: [monster({ [field]: value })]
        }));

        await expectInvalidResponse(getPlayerMonsters(PLAYER_UUID));
    });

    it("rejects a collection count that does not match the array", async () => {
        mockResponse(jsonResponse({ monsters_found: 2, monsters: [monster()] }));

        await expectInvalidResponse(getPlayerMonsters(PLAYER_UUID));
    });

    it("accepts complete detail monsters and nested recipe parents", async () => {
        const detailMonster = monster({
            recipes: [{ parent1: recipeParent(), parent2: recipeParent() }]
        });
        delete detailMonster.owner_id;
        mockResponse(jsonResponse({ monster: detailMonster }));

        await expect(getMonsterInfoById(1)).resolves.toEqual({ monster: detailMonster });
    });

    it.each([
        ["display_name", ""],
        ["image_path", null],
        ["tier", 1.5]
    ])("rejects a detail recipe parent with invalid %s", async (field, value) => {
        const detailMonster = monster({
            recipes: [{
                parent1: recipeParent({ [field]: value }),
                parent2: recipeParent()
            }]
        });
        delete detailMonster.owner_id;
        mockResponse(jsonResponse({ monster: detailMonster }));

        await expectInvalidResponse(getMonsterInfoById(1));
    });

    it("requires detail recipes to be an array", async () => {
        const detailMonster = monster({ recipes: null });
        delete detailMonster.owner_id;
        mockResponse(jsonResponse({ monster: detailMonster }));

        await expectInvalidResponse(getMonsterInfoById(1));
    });

    it("accepts complete fusion result monsters", async () => {
        mockResponse(jsonResponse({ monster: monster() }, { status: 201 }));

        await expect(fuseMonsters(1, 2, PLAYER_UUID)).resolves.toEqual({ monster: monster() });
    });

    it("rejects malformed fusion result monsters", async () => {
        mockResponse(jsonResponse({ monster: monster({ owner_id: null }) }, { status: 201 }));

        await expect(fuseMonsters(1, 2, PLAYER_UUID)).rejects.toMatchObject({
            message: "Invalid response from server",
            status: 201,
            uncertain: true
        });
    });
});

describe("request timeout and cancellation", () => {
    function mockPendingFetch() {
        vi.stubGlobal("fetch", vi.fn((url, { signal }) => new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => {
                reject(new DOMException("The operation was aborted.", "AbortError"));
            }, { once: true });
        })));
    }

    it("times out bounded read requests and clears timer resources", async () => {
        vi.useFakeTimers();
        mockPendingFetch();

        const result = getPlayerMonsters(PLAYER_UUID);
        const assertion = expect(result).rejects.toMatchObject({
            message: "Request timed out",
            status: null,
            code: "REQUEST_TIMEOUT",
            uncertain: false
        });
        await vi.advanceTimersByTimeAsync(10_000);

        await assertion;
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
        ["player creation", () => createPlayer("Ada")],
        ["fusion", () => fuseMonsters(1, 2, PLAYER_UUID)]
    ])("marks timed-out %s requests as uncertain", async (label, makeRequest) => {
        vi.useFakeTimers();
        mockPendingFetch();

        const result = makeRequest();
        const assertion = expect(result).rejects.toMatchObject({
            code: "REQUEST_TIMEOUT",
            uncertain: true
        });
        await vi.advanceTimersByTimeAsync(10_000);

        await assertion;
    });

    it("preserves caller cancellation as AbortError", async () => {
        mockPendingFetch();
        const controller = new AbortController();
        const result = getMonsterInfoById(1, { signal: controller.signal });

        controller.abort();

        await expect(result).rejects.toMatchObject({ name: "AbortError" });
    });

    it("passes through network failures", async () => {
        const networkError = new TypeError("Failed to fetch");
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

        await expect(getPlayerMonsters(PLAYER_UUID)).rejects.toBe(networkError);
    });

    it("clears timeout resources after a normal response", async () => {
        vi.useFakeTimers();
        mockResponse(jsonResponse({ monsters_found: 0, monsters: [] }));

        await expect(getPlayerMonsters(PLAYER_UUID)).resolves.toEqual({
            monsters_found: 0,
            monsters: []
        });
        expect(vi.getTimerCount()).toBe(0);
    });
});
