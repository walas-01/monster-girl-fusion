import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/api.js", async importOriginal => {
    const actual = await importOriginal();

    return {
        ...actual,
        createPlayer: vi.fn(),
        fuseMonsters: vi.fn(),
        getPlayerByUuid: vi.fn(),
        getPlayerMonsters: vi.fn()
    };
});

import {
    createPlayer,
    fuseMonsters,
    getPlayerByUuid,
    getPlayerMonsters
} from "../services/api.js";
import { usePlayer } from "./PlayerContext.js";
import { PlayerProvider } from "./PlayerContext.jsx";

const PLAYER_UUID = "123e4567-e89b-42d3-a456-426614174000";
const PLAYER = {
    id: 1,
    uuid: PLAYER_UUID,
    username: "Ada",
    monster_slots: 10,
    wood: 0,
    stone: 0,
    food: 0
};
const PARENT_ONE = {
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
    owner_id: 1
};
const PARENT_TWO = {
    ...PARENT_ONE,
    id: 2,
    name: "fire",
    display_name: "Fire",
    image_path: "monsters/fire.png",
    type: "fire"
};
const FUSION_RESULT = {
    ...PARENT_ONE,
    id: 3,
    name: "steam",
    display_name: "Steam",
    image_path: "monsters/steam.png"
};

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

function StateHarness({ label = "current", onCreation, onFusion }) {
    const context = usePlayer();

    return (
        <div>
            <span data-testid="view">{label}</span>
            <span data-testid="uuid">{context.playerUuid || "none"}</span>
            <span data-testid="player">{context.player?.username || "none"}</span>
            <span data-testid="player-loading">{String(context.playerLoading)}</span>
            <span data-testid="player-error">{context.playerError || "none"}</span>
            <span data-testid="creation-status">{context.playerCreationStatus}</span>
            <span data-testid="monsters-count">{context.monsters.length}</span>
            <span data-testid="monsters-error">{context.monstersError || "none"}</span>
            <span data-testid="fusion-status">{context.fusionOperation.status}</span>
            <span data-testid="fusion-message">{context.fusionOperation.message || "none"}</span>
            <span data-testid="fusion-unresolved">{String(context.fusionOperation.unresolved)}</span>
            <span data-testid="fusion-result">{context.fusionOperation.result?.display_name || "none"}</span>
            <button
                type="button"
                onClick={() => {
                    const promise = context.createNewPlayer(" Ada ");
                    onCreation?.(promise);
                    promise.catch(() => {});
                }}
            >
                Create
            </button>
            <button type="button" onClick={context.retryPlayerLoad}>Retry</button>
            <button type="button" onClick={context.resetPlayerSession}>Reset</button>
            <button
                type="button"
                onClick={() => {
                    const promise = context.submitFusion([1, 2]);
                    onFusion?.(promise);
                    promise.catch(() => {});
                }}
            >
                Fusion
            </button>
            <button
                type="button"
                onClick={() => context.retryFusionReconciliation().catch(() => {})}
            >
                Sync
            </button>
            <button type="button" onClick={context.acknowledgeFusion}>Acknowledge</button>
        </div>
    );
}

function NavigationHarness({ onCreation, onFusion }) {
    const [alternate, setAlternate] = useState(false);

    return (
        <>
            <button type="button" onClick={() => setAlternate(current => !current)}>
                Navigate
            </button>
            {alternate
                ? <StateHarness label="alternate" onCreation={onCreation} onFusion={onFusion} />
                : <StateHarness label="current" onCreation={onCreation} onFusion={onFusion} />}
        </>
    );
}

function renderProvider(child = <StateHarness />) {
    return render(<PlayerProvider>{child}</PlayerProvider>);
}

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

describe("player restoration", () => {
    it("starts as a guest without requesting when no UUID is stored", () => {
        renderProvider();

        expect(screen.getByTestId("uuid")).toHaveTextContent("none");
        expect(screen.getByTestId("player-loading")).toHaveTextContent("false");
        expect(getPlayerByUuid).not.toHaveBeenCalled();
    });

    it("removes malformed stored identity without requesting it", () => {
        localStorage.setItem("playerUuid", "not-a-uuid");

        renderProvider();

        expect(localStorage.getItem("playerUuid")).toBeNull();
        expect(screen.getByTestId("uuid")).toHaveTextContent("none");
        expect(getPlayerByUuid).not.toHaveBeenCalled();
    });

    it("restores a valid player and an empty collection", async () => {
        localStorage.setItem("playerUuid", PLAYER_UUID.toUpperCase());
        getPlayerByUuid.mockResolvedValue({ player: PLAYER });
        getPlayerMonsters.mockResolvedValue({ monsters_found: 0, monsters: [] });

        renderProvider();

        expect(await screen.findByText("Ada")).toBeInTheDocument();
        expect(localStorage.getItem("playerUuid")).toBe(PLAYER_UUID);
        expect(getPlayerByUuid).toHaveBeenCalledWith(PLAYER_UUID);
        expect(getPlayerMonsters).toHaveBeenCalledWith(PLAYER_UUID);
    });

    it.each([400, 404])("clears stored identity after lookup status %s", async status => {
        localStorage.setItem("playerUuid", PLAYER_UUID);
        getPlayerByUuid.mockRejectedValue(Object.assign(new Error("Invalid player"), { status }));

        renderProvider();

        await waitFor(() => expect(screen.getByTestId("uuid")).toHaveTextContent("none"));
        expect(localStorage.getItem("playerUuid")).toBeNull();
        expect(screen.getByTestId("player-error")).toHaveTextContent("none");
    });

    it("preserves identity through a transient error and supports retry", async () => {
        localStorage.setItem("playerUuid", PLAYER_UUID);
        getPlayerByUuid
            .mockRejectedValueOnce(new TypeError("Failed to fetch"))
            .mockResolvedValueOnce({ player: PLAYER });
        getPlayerMonsters.mockResolvedValue({ monsters_found: 0, monsters: [] });

        renderProvider();

        expect(await screen.findByText("Failed to fetch")).toBeInTheDocument();
        expect(localStorage.getItem("playerUuid")).toBe(PLAYER_UUID);

        fireEvent.click(screen.getByRole("button", { name: "Retry" }));

        expect(await screen.findByText("Ada")).toBeInTheDocument();
        expect(getPlayerByUuid).toHaveBeenCalledTimes(2);
    });

    it("explicitly resets an unrecoverable restoration state", async () => {
        localStorage.setItem("playerUuid", PLAYER_UUID);
        getPlayerByUuid.mockRejectedValue(new Error("Offline"));

        renderProvider();
        expect(await screen.findByText("Offline")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Reset" }));

        expect(screen.getByTestId("uuid")).toHaveTextContent("none");
        expect(screen.getByTestId("player-error")).toHaveTextContent("none");
        expect(localStorage.getItem("playerUuid")).toBeNull();
    });
});

describe("player creation", () => {
    it("keeps one creation request pending across navigation and duplicate actions", async () => {
        const pendingCreation = deferred();
        let creationOperation;
        createPlayer.mockReturnValue(pendingCreation.promise);
        getPlayerMonsters.mockResolvedValue({ monsters_found: 0, monsters: [] });

        renderProvider(<NavigationHarness onCreation={promise => { creationOperation = promise; }} />);
        fireEvent.click(screen.getByRole("button", { name: "Create" }));
        fireEvent.click(screen.getByRole("button", { name: "Navigate" }));

        expect(screen.getByTestId("view")).toHaveTextContent("alternate");
        expect(screen.getByTestId("creation-status")).toHaveTextContent("pending");
        fireEvent.click(screen.getByRole("button", { name: "Create" }));
        expect(createPlayer).toHaveBeenCalledTimes(1);
        expect(createPlayer).toHaveBeenCalledWith("Ada");

        await act(async () => {
            pendingCreation.resolve({ player: PLAYER });
            await creationOperation;
        });

        await waitFor(() => expect(screen.getByTestId("player")).toHaveTextContent("Ada"));
        expect(screen.getByTestId("creation-status")).toHaveTextContent("idle");
        expect(localStorage.getItem("playerUuid")).toBe(PLAYER_UUID);
    });

    it("exposes confirmed creation failures for retry", async () => {
        createPlayer.mockRejectedValue(Object.assign(new Error("Username required"), { status: 400 }));

        renderProvider();
        fireEvent.click(screen.getByRole("button", { name: "Create" }));

        await waitFor(() => expect(screen.getByTestId("creation-status")).toHaveTextContent("error"));
        expect(screen.getByTestId("uuid")).toHaveTextContent("none");
    });

    it("blocks another creation after an uncertain outcome until reset", async () => {
        createPlayer.mockRejectedValue(Object.assign(new Error("Invalid response from server"), {
            status: 201,
            uncertain: true
        }));

        renderProvider();
        fireEvent.click(screen.getByRole("button", { name: "Create" }));

        await waitFor(() => expect(screen.getByTestId("creation-status")).toHaveTextContent("uncertain"));
        fireEvent.click(screen.getByRole("button", { name: "Create" }));
        expect(createPlayer).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: "Reset" }));
        expect(screen.getByTestId("creation-status")).toHaveTextContent("idle");
    });

    it("treats a network failure as an uncertain creation outcome", async () => {
        createPlayer.mockRejectedValue(new TypeError("Failed to fetch"));

        renderProvider();
        fireEvent.click(screen.getByRole("button", { name: "Create" }));

        await waitFor(() => expect(screen.getByTestId("creation-status")).toHaveTextContent("uncertain"));
    });
});

async function renderLoadedFusionProvider(child = <StateHarness />, collection = [PARENT_ONE, PARENT_TWO]) {
    localStorage.setItem("playerUuid", PLAYER_UUID);
    getPlayerByUuid.mockResolvedValue({ player: PLAYER });
    getPlayerMonsters.mockResolvedValueOnce({
        monsters_found: collection.length,
        monsters: collection
    });
    renderProvider(child);
    await waitFor(() => expect(screen.getByTestId("monsters-count")).toHaveTextContent(String(collection.length)));
}

describe("fusion lifecycle", () => {
    it("persists one pending request and its result across child remounts", async () => {
        const pendingFusion = deferred();
        let fusionOperation;
        fuseMonsters.mockReturnValue(pendingFusion.promise);

        await renderLoadedFusionProvider(
            <NavigationHarness onFusion={promise => { fusionOperation = promise; }} />
        );
        fireEvent.click(screen.getByRole("button", { name: "Fusion" }));
        fireEvent.click(screen.getByRole("button", { name: "Navigate" }));

        expect(screen.getByTestId("view")).toHaveTextContent("alternate");
        expect(screen.getByTestId("fusion-status")).toHaveTextContent("pending");
        fireEvent.click(screen.getByRole("button", { name: "Fusion" }));
        expect(fuseMonsters).toHaveBeenCalledOnce();
        expect(fuseMonsters).toHaveBeenCalledWith(1, 2, PLAYER_UUID);

        await act(async () => {
            pendingFusion.resolve({ monster: FUSION_RESULT });
            await fusionOperation;
        });

        expect(screen.getByTestId("fusion-status")).toHaveTextContent("success");
        expect(screen.getByTestId("fusion-result")).toHaveTextContent("Steam");
        expect(screen.getByTestId("monsters-count")).toHaveTextContent("1");
    });

    it("keeps the collection for a confirmed no-recipe rejection", async () => {
        fuseMonsters.mockRejectedValue(Object.assign(new Error("No recipe matches that fusion"), { status: 400 }));
        await renderLoadedFusionProvider();

        fireEvent.click(screen.getByRole("button", { name: "Fusion" }));

        await waitFor(() => expect(screen.getByTestId("fusion-status")).toHaveTextContent("confirmed-error"));
        expect(screen.getByTestId("fusion-message")).toHaveTextContent("No recipe matches");
        expect(screen.getByTestId("monsters-count")).toHaveTextContent("2");
        expect(getPlayerMonsters).toHaveBeenCalledOnce();
    });

    it("reconciles a missing-parent 404 and reports a changed collection", async () => {
        fuseMonsters.mockRejectedValue(Object.assign(new Error("Monster 2 not found"), { status: 404 }));
        await renderLoadedFusionProvider();
        getPlayerMonsters.mockResolvedValueOnce({ monsters_found: 1, monsters: [PARENT_ONE] });

        fireEvent.click(screen.getByRole("button", { name: "Fusion" }));

        await waitFor(() => expect(screen.getByTestId("fusion-status")).toHaveTextContent("uncertain"));
        expect(screen.getByTestId("fusion-message")).toHaveTextContent("La colección cambió");
        expect(screen.getByTestId("fusion-unresolved")).toHaveTextContent("false");
        expect(screen.getByTestId("monsters-count")).toHaveTextContent("1");
    });

    it("turns an uncertain failure into a confirmed failure when both parents remain", async () => {
        fuseMonsters.mockRejectedValue(Object.assign(new Error("Request timed out"), {
            code: "REQUEST_TIMEOUT",
            uncertain: true
        }));
        await renderLoadedFusionProvider();
        getPlayerMonsters.mockResolvedValueOnce({ monsters_found: 2, monsters: [PARENT_ONE, PARENT_TWO] });

        fireEvent.click(screen.getByRole("button", { name: "Fusion" }));

        await waitFor(() => expect(screen.getByTestId("fusion-status")).toHaveTextContent("confirmed-error"));
        expect(screen.getByTestId("fusion-message")).toHaveTextContent("Request timed out");
    });

    it.each([
        [new TypeError("Failed to fetch"), "connection loss"],
        [Object.assign(new Error("Invalid response from server"), { status: 201, uncertain: true }), "malformed success"],
        [Object.assign(new Error("Server failed"), { status: 500 }), "server failure"]
    ])("reports a synchronized collection change after %s", async (fusionError) => {
        fuseMonsters.mockRejectedValue(fusionError);
        await renderLoadedFusionProvider();
        getPlayerMonsters.mockResolvedValueOnce({ monsters_found: 0, monsters: [] });

        fireEvent.click(screen.getByRole("button", { name: "Fusion" }));

        await waitFor(() => expect(screen.getByTestId("fusion-status")).toHaveTextContent("uncertain"));
        expect(screen.getByTestId("fusion-unresolved")).toHaveTextContent("false");
        expect(screen.getByTestId("monsters-count")).toHaveTextContent("0");
    });

    it("clears local identity when reconciliation confirms a deleted player", async () => {
        fuseMonsters.mockRejectedValue(Object.assign(new Error("Player not found"), { status: 404 }));
        await renderLoadedFusionProvider();
        getPlayerMonsters.mockRejectedValueOnce(Object.assign(new Error("Player not found"), { status: 404 }));

        fireEvent.click(screen.getByRole("button", { name: "Fusion" }));

        await waitFor(() => expect(screen.getByTestId("uuid")).toHaveTextContent("none"));
        expect(screen.getByTestId("fusion-status")).toHaveTextContent("idle");
        expect(localStorage.getItem("playerUuid")).toBeNull();
    });

    it("blocks another POST after failed reconciliation until synchronization succeeds", async () => {
        fuseMonsters.mockRejectedValue(new TypeError("Failed to fetch"));
        await renderLoadedFusionProvider();
        getPlayerMonsters
            .mockRejectedValueOnce(new TypeError("Still offline"))
            .mockResolvedValueOnce({ monsters_found: 2, monsters: [PARENT_ONE, PARENT_TWO] });

        fireEvent.click(screen.getByRole("button", { name: "Fusion" }));
        await waitFor(() => expect(screen.getByTestId("fusion-unresolved")).toHaveTextContent("true"));

        fireEvent.click(screen.getByRole("button", { name: "Fusion" }));
        expect(fuseMonsters).toHaveBeenCalledOnce();

        fireEvent.click(screen.getByRole("button", { name: "Sync" }));
        await waitFor(() => expect(screen.getByTestId("fusion-status")).toHaveTextContent("confirmed-error"));
        expect(screen.getByTestId("fusion-unresolved")).toHaveTextContent("false");
        expect(fuseMonsters).toHaveBeenCalledOnce();
    });
});
