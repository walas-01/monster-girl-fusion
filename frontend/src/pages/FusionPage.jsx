import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { Stat } from "../components/MonsterItem/Stat.jsx";
import TypeTag from "../components/MonsterItem/TypeTag.jsx";
import { usePlayer } from "../context/PlayerContext.js";
import { getImage } from "../imageHandler.js";

function FusionPage() {
    const {
        monsters,
        monstersLoading,
        monstersError,
        player,
        playerLoading,
        playerError,
        retryPlayerLoad,
        resetPlayerSession,
        refreshMonsters,
        fusionOperation,
        submitFusion,
        retryFusionReconciliation,
        acknowledgeFusion
    } = usePlayer();
    const [selectedIds, setSelectedIds] = useState([]);

    const validSelectedIds = selectedIds.filter(selectedId => (
        monsters.some(monster => monster.id === selectedId)
    ));
    const operationActive = fusionOperation.status !== "idle";
    const displayedIds = operationActive ? fusionOperation.parentIds : validSelectedIds;
    const displayedMonsters = displayedIds.map(parentId => (
        monsters.find(monster => monster.id === parentId) || null
    ));
    const canSubmit = Boolean(player)
        && !playerLoading
        && !playerError
        && !monstersLoading
        && !monstersError
        && validSelectedIds.length === 2
        && !operationActive;

    function toggleMonster(monsterId) {
        if (operationActive) {
            return;
        }

        setSelectedIds(currentIds => {
            const currentValidIds = currentIds.filter(selectedId => (
                monsters.some(monster => monster.id === selectedId)
            ));

            if (currentValidIds.includes(monsterId)) {
                return currentValidIds.filter(selectedId => selectedId !== monsterId);
            }

            if (currentValidIds.length === 2) {
                return currentValidIds;
            }

            return [...currentValidIds, monsterId];
        });
    }

    function handleFusion() {
        if (!canSubmit) {
            return;
        }

        submitFusion(validSelectedIds).catch(() => {});
    }

    function retryMonsters() {
        refreshMonsters().catch(() => {});
    }

    let content;

    if (playerLoading) {
        content = <p role="status">Cargando jugador...</p>;
    } else if (playerError) {
        content = (
            <StateError message="No se pudo cargar el jugador." onRetry={retryPlayerLoad} onReset={resetPlayerSession} />
        );
    } else if (!player) {
        content = (
            <div>
                <p>Necesitas un jugador para fusionar monstruos.</p>
                <Link to="/">Volver al inicio</Link>
            </div>
        );
    } else if (monstersLoading) {
        content = <p role="status">Cargando monstruos...</p>;
    } else if (monstersError) {
        content = <StateError message="No se pudieron cargar los monstruos." onRetry={retryMonsters} />;
    } else if (monsters.length === 0) {
        content = <p>Tu colección todavía no tiene monstruos para fusionar.</p>;
    } else {
        const selectionFull = validSelectedIds.length === 2;
        const operationPending = fusionOperation.status === "pending";
        const operationReconciling = fusionOperation.status === "reconciling";
        const fusionLabel = operationPending
            ? "Fusionando..."
            : operationReconciling
                ? "Verificando..."
                : "¡Fusionar!";

        content = (
            <>
                <div
                    className="flex items-center justify-around p-3 bg-gray-900 text-gray-300 rounded-xl m-6"
                    aria-busy={operationPending || operationReconciling}
                >
                    <ParentImage monster={displayedMonsters[0]} />

                    <button
                        type="button"
                        disabled={!canSubmit}
                        className={`flex flex-col items-center p-2 rounded-xl transition-colors border-indigo-800 ${canSubmit ? "bg-indigo-500 hover:bg-indigo-600 cursor-pointer animate-bounce " : "bg-slate-800 cursor-not-allowed"}`}
                        onClick={handleFusion}
                    >
                        <img src={getImage("icons/icon_fuse.png")} alt="" className="h-7" />
                        <span className="font-bold text-sm">{fusionLabel}</span>
                    </button>

                    <ParentImage monster={displayedMonsters[1]} />
                </div>

                <div aria-live="polite">
                    {(operationPending || operationReconciling) && <p>{fusionOperation.message}</p>}
                    {fusionOperation.unresolved && !fusionOperation.noticeOpen && (
                        <div role="alert">
                            <p>{fusionOperation.message}</p>
                            <button
                                type="button"
                                onClick={() => retryFusionReconciliation().catch(() => {})}
                            >
                                Reintentar sincronización
                            </button>
                        </div>
                    )}
                    {selectionFull && !operationActive && (
                        <p>Deselecciona un monstruo antes de elegir otro.</p>
                    )}
                </div>

                <p className="text-lg font-light mx-2 border-b-1 border-gray-500">Mis Monstruos</p>

                <div className="grid grid-cols-2 p-3 gap-2 max-h-[490px] overflow-y-auto">
                    {monsters.map(monster => {
                        const selected = validSelectedIds.includes(monster.id);
                        const disabled = operationActive || (selectionFull && !selected);

                        return (
                            <MonsterChoice
                                key={monster.id}
                                monster={monster}
                                selected={selected}
                                disabled={disabled}
                                onSelect={() => toggleMonster(monster.id)}
                            />
                        );
                    })}
                </div>
            </>
        );
    }

    return (
        <div className="bg-gray-950 text-gray-300">
            <div className="w-full bg-black overflow-hidden md:max-w-[390px]">
                <main className="flex-1 overflow-y-auto">
                    {fusionOperation.noticeOpen && (
                        <FusionResultWindow
                            operation={fusionOperation}
                            onClose={acknowledgeFusion}
                            onRetry={retryFusionReconciliation}
                        />
                    )}
                    {content}
                </main>
            </div>
        </div>
    );
}

function StateError({ message, onRetry, onReset }) {
    return (
        <div role="alert">
            <p>{message}</p>
            <button type="button" onClick={onRetry}>Reintentar</button>
            {onReset && <button type="button" onClick={onReset}>Restablecer sesión local</button>}
        </div>
    );
}

function ParentImage({ monster }) {
    return (
        <img
            src={getImage(monster?.image_path || "monsters/default.png")}
            alt={monster?.display_name || ""}
            className="sprite-borde w-35 h-35 mb-2"
        />
    );
}

function MonsterChoice({ monster, selected, disabled, onSelect }) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            className={`flex text-gray-300 rounded-xl gap-1 text-left ${selected ? "bg-indigo-800" : "bg-gray-800"}`}
            onClick={onSelect}
        >
            <img src={getImage(monster.image_path)} alt={monster.display_name} className="sprite-borde w-20 h-20 mb-2" />
            <span className="flex flex-col justify-center gap-2">
                <span className="text-sm">{monster.display_name}</span>
                <span className="flex gap-2">
                    <TypeTag type={monster.type} showText={false} />
                    <span className="text-sm">Tier {monster.tier}</span>
                </span>
            </span>
        </button>
    );
}

function FusionResultWindow({ operation, onClose, onRetry }) {
    const dialogRef = useRef(null);
    const initialFocusRef = useRef(null);

    useEffect(() => {
        const previousFocus = document.activeElement;
        initialFocusRef.current?.focus();

        function handleKeyDown(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key !== "Tab") {
                return;
            }

            const focusable = [...dialogRef.current.querySelectorAll(
                "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
            )];
            const first = focusable[0];
            const last = focusable.at(-1);

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        }

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            previousFocus?.focus();
        };
    }, [onClose]);

    const title = operation.status === "success"
        ? "¡Fusión exitosa!"
        : operation.status === "confirmed-error"
            ? "Fusión no completada"
            : "Resultado no confirmado";

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="fusion-dialog-title"
                className="bg-gray-800 rounded-2xl w-full max-w-90 text-center p-4"
            >
                <h2 id="fusion-dialog-title" className="text-2xl font-bold mb-2">{title}</h2>

                {operation.result ? (
                    <FusionMonster monster={operation.result} />
                ) : (
                    <p>{operation.message}</p>
                )}

                {operation.unresolved && (
                    <button
                        ref={initialFocusRef}
                        type="button"
                        onClick={() => onRetry().catch(() => {})}
                        className="mt-6 bg-indigo-600 px-6 py-2 rounded-lg"
                    >
                        Reintentar sincronización
                    </button>
                )}

                <button
                    ref={operation.unresolved ? undefined : initialFocusRef}
                    type="button"
                    onClick={onClose}
                    className="mt-6 bg-indigo-600 px-6 py-2 rounded-lg"
                >
                    Volver
                </button>
            </div>
        </div>
    );
}

function FusionMonster({ monster }) {
    return (
        <div className="flex">
            <img src={getImage(monster.image_path)} alt={monster.display_name} className="mb-4 sprite-borde object-contain w-1/2" />
            <div>
                <div className="flex flex-col items-center">
                    <p className="text-xl font-bold">{monster.display_name}</p>
                    <div className="flex gap-4 items-center">
                        <TypeTag type={monster.type} />
                        <span className="text-sm font-bold">Tier {monster.tier}</span>
                    </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 w-full">
                    <Stat stat="HP" value={monster.max_hp} max_value={180} img="icons/icon_hp.png" />
                    <Stat stat="SPD" value={monster.spd} max_value={25} img="icons/icon_spd.png" />
                    <Stat stat="ATK" value={monster.atk} max_value={40} img="icons/icon_atk.png" />
                    <Stat stat="AIM" value={monster.aim} max_value={11} img="icons/icon_aim.png" />
                </div>
            </div>
        </div>
    );
}

export default FusionPage;
