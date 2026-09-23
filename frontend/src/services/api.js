const REQUEST_TIMEOUT_MS = 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
}

function isNonnegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

export function isValidUuid(value) {
    return typeof value === "string" && UUID_PATTERN.test(value);
}

function isCreatedPlayer(value) {
    return isRecord(value)
        && isPositiveInteger(value.id)
        && isValidUuid(value.uuid)
        && isNonEmptyString(value.username);
}

function isRestoredPlayer(value) {
    return isCreatedPlayer(value)
        && isNonnegativeInteger(value.monster_slots)
        && isNonnegativeInteger(value.wood)
        && isNonnegativeInteger(value.stone)
        && isNonnegativeInteger(value.food);
}

function isMonster(value) {
    return isRecord(value)
        && isPositiveInteger(value.id)
        && isNonEmptyString(value.name)
        && isNonEmptyString(value.display_name)
        && isNonEmptyString(value.image_path)
        && isNonEmptyString(value.type)
        && isNonnegativeInteger(value.tier)
        && Number.isSafeInteger(value.max_hp)
        && value.max_hp > 0
        && isNonnegativeInteger(value.atk)
        && isNonnegativeInteger(value.spd)
        && isNonnegativeInteger(value.aim)
        && (value.nickname === null || typeof value.nickname === "string");
}

function isOwnedMonster(value) {
    return isMonster(value) && isPositiveInteger(value.owner_id);
}

function isRecipeParent(value) {
    return isRecord(value)
        && isNonEmptyString(value.display_name)
        && isNonEmptyString(value.image_path)
        && isNonnegativeInteger(value.tier);
}

function isDetailMonster(value) {
    return isMonster(value)
        && Array.isArray(value.recipes)
        && value.recipes.every(recipe => (
            isRecord(recipe)
            && isRecipeParent(recipe.parent1)
            && isRecipeParent(recipe.parent2)
        ));
}

function createApiError(message, status, requestId, properties = {}) {
    const error = new Error(message);
    error.status = status;

    if (requestId) {
        error.requestId = requestId;
    }

    return Object.assign(error, properties);
}

async function parseResponse(response, fallbackMessage, validate) {
    const requestId = response.headers.get("X-Request-ID") || undefined;
    const text = await response.text();
    let data = null;

    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            if (response.ok) {
                throw createApiError("Invalid JSON response", response.status, requestId);
            }
        }
    }

    if (!response.ok) {
        const message = isRecord(data) && isNonEmptyString(data.message)
            ? data.message
            : fallbackMessage;

        throw createApiError(message, response.status, requestId);
    }

    if (!validate(data)) {
        throw createApiError("Invalid response from server", response.status, requestId);
    }

    return data;
}

async function request(
    url,
    options,
    fallbackMessage,
    validate,
    { uncertainOnTimeout = false, uncertainOnInvalidSuccess = false } = {}
) {
    const controller = new AbortController();
    const callerSignal = options?.signal;
    let timedOut = false;

    const abortFromCaller = () => controller.abort(callerSignal.reason);

    if (callerSignal?.aborted) {
        abortFromCaller();
    } else {
        callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    }

    const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        return await parseResponse(response, fallbackMessage, validate);
    } catch (error) {
        if (timedOut) {
            throw createApiError("Request timed out", null, undefined, {
                cause: error,
                code: "REQUEST_TIMEOUT",
                uncertain: uncertainOnTimeout
            });
        }

        if (callerSignal?.aborted && error?.name !== "AbortError") {
            throw new DOMException("The operation was aborted.", "AbortError");
        }

        if (uncertainOnInvalidSuccess && error?.status >= 200 && error.status < 300) {
            error.uncertain = true;
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener("abort", abortFromCaller);
    }
}

export function createPlayer(username) {
    return request(
        "/api/players",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username })
        },
        "Failed to create player",
        data => isRecord(data) && isCreatedPlayer(data.player),
        { uncertainOnTimeout: true, uncertainOnInvalidSuccess: true }
    );
}

export function getMonsterInfoById(monsterId, { signal } = {}) {
    return request(
        `/api/monsters/details/${monsterId}`,
        { signal },
        "Failed to get monster info",
        data => isRecord(data) && isDetailMonster(data.monster)
    );
}

export function getPlayerMonsters(uuid) {
    return request(
        `/api/monsters/${uuid}`,
        undefined,
        "Failed to get monsters",
        data => (
            isRecord(data)
            && isNonnegativeInteger(data.monsters_found)
            && Array.isArray(data.monsters)
            && data.monsters_found === data.monsters.length
            && data.monsters.every(isOwnedMonster)
        )
    );
}

export function getPlayerByUuid(uuid) {
    return request(
        `/api/players/${uuid}`,
        undefined,
        "Failed to get player data",
        data => (
            isRecord(data)
            && isRestoredPlayer(data.player)
            && data.player.uuid.toLowerCase() === uuid.toLowerCase()
        )
    );
}

export function fuseMonsters(parent1Id, parent2Id, playerUuid) {
    return request(
        "/api/monsters/fuse",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parent1Id, parent2Id, playerUuid })
        },
        "Fusion failed",
        data => isRecord(data) && isOwnedMonster(data.monster),
        { uncertainOnTimeout: true, uncertainOnInvalidSuccess: true }
    );
}
