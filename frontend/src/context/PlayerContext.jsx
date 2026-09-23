import { useCallback, useEffect, useRef, useState } from "react";

import {
    createPlayer,
    fuseMonsters,
    getPlayerByUuid,
    getPlayerMonsters,
    isValidUuid
} from "../services/api.js";
import { PlayerContext } from "./PlayerContext.js";

const INITIAL_FUSION_OPERATION = {
    status: "idle",
    parentIds: [],
    result: null,
    message: null,
    unresolved: false,
    noticeOpen: false
};

function readStoredPlayerUuid() {
    const storedUuid = localStorage.getItem("playerUuid");

    if (!storedUuid) {
        return null;
    }

    if (!isValidUuid(storedUuid)) {
        localStorage.removeItem("playerUuid");
        return null;
    }

    const canonicalUuid = storedUuid.toLowerCase();
    localStorage.setItem("playerUuid", canonicalUuid);
    return canonicalUuid;
}

export function PlayerProvider({ children }) {
    const [initialPlayerUuid] = useState(readStoredPlayerUuid);
    const playerRequestId = useRef(0);
    const monstersRequestId = useRef(0);
    const creationRequestId = useRef(0);
    const creationRequest = useRef(null);
    const fusionRequestId = useRef(0);
    const fusionRequest = useRef(null);
    const initializing = useRef(false);

    const [playerUuid, setPlayerUuid] = useState(initialPlayerUuid);
    const [player, setPlayer] = useState(null);
    const [playerLoading, setPlayerLoading] = useState(Boolean(initialPlayerUuid));
    const [playerError, setPlayerError] = useState(null);

    const [playerCreationStatus, setPlayerCreationStatus] = useState("idle");
    const [playerCreationError, setPlayerCreationError] = useState(null);

    const [monsters, setMonsters] = useState([]);
    const [monstersLoading, setMonstersLoading] = useState(false);
    const [monstersError, setMonstersError] = useState(null);

    const [fusionOperation, setFusionOperation] = useState(INITIAL_FUSION_OPERATION);

    const resetPlayerSession = useCallback(() => {
        playerRequestId.current += 1;
        monstersRequestId.current += 1;
        creationRequestId.current += 1;
        creationRequest.current = null;
        fusionRequestId.current += 1;
        fusionRequest.current = null;
        localStorage.removeItem("playerUuid");
        setPlayerUuid(null);
        setPlayer(null);
        setPlayerLoading(false);
        setPlayerError(null);
        setPlayerCreationStatus("idle");
        setPlayerCreationError(null);
        setMonsters([]);
        setMonstersLoading(false);
        setMonstersError(null);
        setFusionOperation(INITIAL_FUSION_OPERATION);
    }, []);

    const loadMonsters = useCallback(async (uuid) => {
        const requestId = ++monstersRequestId.current;

        setMonstersLoading(true);
        setMonstersError(null);

        try {
            const response = await getPlayerMonsters(uuid);

            if (requestId === monstersRequestId.current) {
                setMonsters(response.monsters);
            }

            return response.monsters;
        } catch (error) {
            if (requestId === monstersRequestId.current) {
                if (error.status === 404 && localStorage.getItem("playerUuid") === uuid) {
                    resetPlayerSession();
                } else {
                    setMonstersError(error.message || "Could not load monsters");
                }
            }

            throw error;
        } finally {
            if (requestId === monstersRequestId.current) {
                setMonstersLoading(false);
            }
        }
    }, [resetPlayerSession]);

    const restorePlayer = useCallback(async (uuid) => {
        const requestId = ++playerRequestId.current;
        monstersRequestId.current += 1;

        setPlayerUuid(uuid);
        setPlayer(null);
        setPlayerLoading(true);
        setPlayerError(null);
        setMonsters([]);
        setMonstersLoading(false);
        setMonstersError(null);

        let playerLoaded = false;

        try {
            const response = await getPlayerByUuid(uuid);

            if (requestId !== playerRequestId.current) {
                return;
            }

            setPlayer(response.player);
            playerLoaded = true;
        } catch (error) {
            if (requestId !== playerRequestId.current) {
                return;
            }

            if (error.status === 400 || error.status === 404) {
                resetPlayerSession();
            } else {
                setPlayerError(error.message || "Could not load player");
            }
        } finally {
            if (requestId === playerRequestId.current) {
                setPlayerLoading(false);
            }
        }

        if (playerLoaded && requestId === playerRequestId.current) {
            try {
                await loadMonsters(uuid);
            } catch {
                // loadMonsters owns collection error and missing-player state.
            }
        }
    }, [loadMonsters, resetPlayerSession]);

    useEffect(() => {
        if (initializing.current || !initialPlayerUuid) {
            return;
        }

        initializing.current = true;
        restorePlayer(initialPlayerUuid);
    }, [initialPlayerUuid, restorePlayer]);

    function createNewPlayer(usernameInput) {
        const username = usernameInput.trim();

        if (!username || playerCreationStatus === "uncertain") {
            return Promise.resolve();
        }

        if (creationRequest.current) {
            return creationRequest.current.promise;
        }

        const requestId = ++creationRequestId.current;
        setPlayerCreationStatus("pending");
        setPlayerCreationError(null);

        const promise = (async () => {
            let createdPlayer;

            try {
                ({ player: createdPlayer } = await createPlayer(username));
            } catch (error) {
                if (requestId === creationRequestId.current) {
                    const uncertain = error.uncertain || error.status == null;
                    setPlayerCreationStatus(uncertain ? "uncertain" : "error");
                    setPlayerCreationError(error);
                }

                throw error;
            }

            if (requestId !== creationRequestId.current) {
                return;
            }

            localStorage.setItem("playerUuid", createdPlayer.uuid);
            playerRequestId.current += 1;
            setPlayerUuid(createdPlayer.uuid);
            setPlayer(createdPlayer);
            setPlayerLoading(false);
            setPlayerError(null);
            setPlayerCreationStatus("idle");
            setPlayerCreationError(null);

            try {
                await loadMonsters(createdPlayer.uuid);
            } catch {
                // loadMonsters owns collection error and missing-player state.
            }

            return createdPlayer;
        })().finally(() => {
            if (creationRequest.current?.id === requestId) {
                creationRequest.current = null;
            }
        });

        creationRequest.current = { id: requestId, promise };
        return promise;
    }

    function refreshMonsters(uuid = playerUuid) {
        if (!uuid) {
            return Promise.resolve([]);
        }

        return loadMonsters(uuid);
    }

    function retryPlayerLoad() {
        const storedUuid = readStoredPlayerUuid();

        if (!storedUuid) {
            return Promise.resolve();
        }

        return restorePlayer(storedUuid);
    }

    async function reconcileFusion(parentIds, fusionError, requestId) {
        setFusionOperation({
            status: "reconciling",
            parentIds,
            result: null,
            message: "Verificando el resultado de la fusión...",
            unresolved: false,
            noticeOpen: false
        });

        const collectionRequestId = ++monstersRequestId.current;

        try {
            const response = await getPlayerMonsters(playerUuid);

            if (requestId !== fusionRequestId.current) {
                return;
            }

            if (collectionRequestId !== monstersRequestId.current) {
                setFusionOperation({
                    status: "uncertain",
                    parentIds,
                    result: null,
                    message: "La verificación fue reemplazada por otra actualización. Sincroniza la colección antes de fusionar otra vez.",
                    unresolved: true,
                    noticeOpen: true
                });
                return;
            }

            setMonsters(response.monsters);
            setMonstersLoading(false);
            setMonstersError(null);

            const parentsStillPresent = parentIds.every(parentId => (
                response.monsters.some(monster => monster.id === parentId)
            ));

            if (parentsStillPresent) {
                setFusionOperation({
                    status: "confirmed-error",
                    parentIds,
                    result: null,
                    message: fusionError.message || "No se pudo completar la fusión.",
                    unresolved: false,
                    noticeOpen: true
                });
            } else {
                setFusionOperation({
                    status: "uncertain",
                    parentIds,
                    result: null,
                    message: "La colección cambió mientras verificábamos la fusión. Revisa tus monstruos antes de continuar.",
                    unresolved: false,
                    noticeOpen: true
                });
            }
        } catch (reconciliationError) {
            if (requestId !== fusionRequestId.current) {
                return;
            }

            if (collectionRequestId === monstersRequestId.current) {
                setMonstersLoading(false);
            }

            if (reconciliationError.status === 404) {
                resetPlayerSession();
                return;
            }

            setFusionOperation({
                status: "uncertain",
                parentIds,
                result: null,
                message: "No se pudo confirmar la fusión ni sincronizar la colección. Reintenta la sincronización antes de fusionar otra vez.",
                unresolved: true,
                noticeOpen: true
            });
        }
    }

    function submitFusion(parentIds) {
        if (fusionRequest.current) {
            return fusionRequest.current.promise;
        }

        const validParents = Array.isArray(parentIds)
            && parentIds.length === 2
            && parentIds[0] !== parentIds[1]
            && parentIds.every(parentId => monsters.some(monster => monster.id === parentId));

        if (!playerUuid || !validParents || fusionOperation.status !== "idle") {
            return Promise.resolve();
        }

        const submittedParentIds = [...parentIds];
        const requestId = ++fusionRequestId.current;
        setFusionOperation({
            status: "pending",
            parentIds: submittedParentIds,
            result: null,
            message: "Fusionando monstruos...",
            unresolved: false,
            noticeOpen: false
        });

        const promise = (async () => {
            try {
                const response = await fuseMonsters(
                    submittedParentIds[0],
                    submittedParentIds[1],
                    playerUuid
                );

                if (requestId !== fusionRequestId.current) {
                    return;
                }

                const consumedIds = new Set(submittedParentIds);
                monstersRequestId.current += 1;
                setMonsters(currentMonsters => [
                    ...currentMonsters.filter(monster => !consumedIds.has(monster.id)),
                    response.monster
                ]);
                setMonstersLoading(false);
                setMonstersError(null);
                setFusionOperation({
                    status: "success",
                    parentIds: submittedParentIds,
                    result: response.monster,
                    message: "¡Fusión exitosa!",
                    unresolved: false,
                    noticeOpen: true
                });

                return response.monster;
            } catch (error) {
                if (requestId !== fusionRequestId.current) {
                    return;
                }

                if (error.status === 400) {
                    setFusionOperation({
                        status: "confirmed-error",
                        parentIds: submittedParentIds,
                        result: null,
                        message: error.message || "No se pudo completar la fusión.",
                        unresolved: false,
                        noticeOpen: true
                    });
                    return;
                }

                await reconcileFusion(submittedParentIds, error, requestId);
            }
        })().finally(() => {
            if (fusionRequest.current?.id === requestId) {
                fusionRequest.current = null;
            }
        });

        fusionRequest.current = { id: requestId, promise };
        return promise;
    }

    function retryFusionReconciliation() {
        if (fusionRequest.current) {
            return fusionRequest.current.promise;
        }

        if (fusionOperation.status !== "uncertain" || !fusionOperation.unresolved) {
            return Promise.resolve();
        }

        const requestId = ++fusionRequestId.current;
        const parentIds = [...fusionOperation.parentIds];
        const originalError = new Error("No se pudo confirmar el resultado de la fusión.");
        const promise = reconcileFusion(parentIds, originalError, requestId).finally(() => {
            if (fusionRequest.current?.id === requestId) {
                fusionRequest.current = null;
            }
        });

        fusionRequest.current = { id: requestId, promise };
        return promise;
    }

    function acknowledgeFusion() {
        if (fusionOperation.unresolved) {
            setFusionOperation(current => ({ ...current, noticeOpen: false }));
            return;
        }

        setFusionOperation(INITIAL_FUSION_OPERATION);
    }

    return (
        <PlayerContext.Provider
            value={{
                playerUuid,
                playerLoading,
                playerError,
                retryPlayerLoad,
                resetPlayerSession,
                createNewPlayer,
                playerCreationStatus,
                playerCreationError,
                monsters,
                monstersLoading,
                monstersError,
                refreshMonsters,
                fusionOperation,
                submitFusion,
                retryFusionReconciliation,
                acknowledgeFusion,
                player
            }}
        >
            {children}
        </PlayerContext.Provider>
    );
}
