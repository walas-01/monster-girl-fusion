import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { Stat } from "../components/MonsterItem/Stat.jsx";
import TypeTag from "../components/MonsterItem/TypeTag.jsx";
import { getImage } from "../imageHandler.js";
import { getMonsterInfoById } from "../services/api.js";

function MonsterDetailPage() {
    const { id } = useParams();
    const [retryCount, setRetryCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [monster, setMonster] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const controller = new AbortController();

        async function loadMonster() {
            setLoading(true);
            setError(null);
            setMonster(null);

            try {
                const response = await getMonsterInfoById(id, {
                    signal: controller.signal
                });

                if (!controller.signal.aborted) {
                    setMonster(response.monster);
                }
            } catch (requestError) {
                if (requestError.name !== "AbortError" && !controller.signal.aborted) {
                    setError(requestError);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        loadMonster();
        return () => controller.abort();
    }, [id, retryCount]);

    let content;

    if (loading) {
        content = <p role="status">Cargando monstruo...</p>;
    } else if (error) {
        content = (
            <DetailError
                error={error}
                onRetry={() => setRetryCount(current => current + 1)}
            />
        );
    } else if (monster) {
        content = <DetailScreen monster={monster} />;
    } else {
        content = <DetailError error={new Error("Missing monster data")} />;
    }

    return (
        <div className="bg-gray-600 text-gray-300">
            <div className="w-full md:min-h-[844px] md:max-w-[390px] bg-black not-even:md:shadow-2xl overflow-hidden flex flex-col">
                <main>{content}</main>
            </div>
        </div>
    );
}

function DetailError({ error, onRetry }) {
    const malformedSuccess = error.status >= 200 && error.status < 300;
    const retryable = error.status == null || error.status >= 500;
    let message = "No se pudo cargar el monstruo.";

    if (error.status === 400) {
        message = "El enlace del monstruo no es válido.";
    } else if (error.status === 404) {
        message = "Este monstruo no existe o ya fue consumido.";
    } else if (malformedSuccess) {
        message = "El servidor devolvió datos de monstruo no válidos.";
    }

    return (
        <div role="alert">
            <p>{message}</p>
            {retryable && onRetry && (
                <button type="button" onClick={onRetry}>Reintentar</button>
            )}
            <Link to="/">Volver al inicio</Link>
        </div>
    );
}

function DetailScreen({ monster }) {
    return (
        <div className="flex-col m-4">
            <div className="bg-slate-800 rounded-md flex">
                <img
                    src={getImage(monster.image_path)}
                    alt={monster.display_name}
                    className="mb-4 sprite-borde object-contain w-1/2"
                />

                <div className="mt-2 w-1/2 flex flex-col">
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

            <div className="mt-4">
                {monster.recipes.length > 0 ? (
                    <>
                        <p className="text-lg font-light mb-6 border-b-1 border-gray-500">R e c e t a s</p>
                        {monster.recipes.map(recipe => (
                            <RecipeItem
                                key={`${recipe.parent1.display_name}-${recipe.parent2.display_name}`}
                                recipe={recipe}
                                resultMonster={monster}
                            />
                        ))}
                    </>
                ) : (
                    <div className="bg-slate-700 rounded-md p-5 flex flex-col items-center">
                        <p>Este monstruo no tiene recetas conocidas.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function RecipeItem({ recipe, resultMonster }) {
    return (
        <div className="flex justify-around items-center bg-slate-800 rounded- pb-4 text-center">
            <RecipeMonster monster={recipe.parent1} />
            <span aria-hidden="true" className="font-bold text-xl">+</span>
            <RecipeMonster monster={recipe.parent2} />
            <span aria-hidden="true" className="font-bold text-xl">→</span>
            <RecipeMonster monster={resultMonster} />
        </div>
    );
}

function RecipeMonster({ monster }) {
    return (
        <div className="flex flex-col items-center">
            <img
                src={getImage(monster.image_path)}
                alt={monster.display_name}
                className="mb-2 sprite-borde w-20"
            />
            <p className="bg-indigo-500 text-white rounded-xl px-2 max-w-20 font-light text-xs">
                {monster.display_name}
            </p>
        </div>
    );
}

export default MonsterDetailPage;
