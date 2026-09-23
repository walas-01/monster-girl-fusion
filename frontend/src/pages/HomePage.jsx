
import { useState } from "react";
import { usePlayer } from "../context/PlayerContext.js";
import { Link } from "react-router";


import MonsterList from '../components/MonsterItem/MonsterList.jsx'
import CreatePlayer from '../components/Player/CreatePlayer.jsx'



import { getImage } from "../imageHandler.js";



function HomePage() {

    const {
        playerUuid,
        playerLoading,
        playerError,
        retryPlayerLoad,
        resetPlayerSession,
        monsters,
        monstersLoading,
        monstersError,
        refreshMonsters,
        createNewPlayer,
        playerCreationStatus,
        playerCreationError
    } = usePlayer();

    const [usernameInput, setUsernameInput] = useState("");


        



    async function handleCreatePlayer() {
        try {
            await createNewPlayer(usernameInput);
        } catch {
            // PlayerProvider owns creation error and uncertain state.
        }
    }

    function retryMonsters() {
        refreshMonsters().catch(() => {});
    }


  return (
        <div className="min-h-screen bg-gray-900 text-gray-300">
            <div className="w-full min-h-screen md:min-h-[844px] md:max-w-[390px] bg-black md:shadow-2xl overflow-hidden flex flex-col">

                

                <main className="flex-1 overflow-y-auto">

                    <div className="flex justify-around m-6 gap-5">

                        <Link  to={`/fusion`} className="w-2/4">
                            <div className="  bg-purple-500 p-2 rounded-xl flex flex-col items-center border-b-8 border-purple-700">
                                <img src={getImage("icons/icon_fusion.png")} alt="" className="h-20"/>
                                <p className="text-xl text-white font-bold">Fusinar</p>
                            </div>
                        </Link>

                        <Link to={`/portal`} className="w-2/4">
                            <div className=" bg-rose-500 p-2 rounded-xl flex flex-col items-center border-b-8 border-rose-800">
                                <img src={getImage("icons/icon_portal.png")} alt="" className="h-20"/>
                                <p className="text-xl text-white font-bold">Excursiones</p>
                            </div>
                        </Link>

                    </div>

                    
                    <p className="text-lg font-light mb-6 mx-2 border-b-1 border-gray-500">
                               Mis Monstruos
                    </p>


                     {playerLoading ? (
                        <p role="status">Cargando jugador...</p>
                    ) : playerError ? (
                        <LoadError
                            message="No se pudo cargar el jugador."
                            onRetry={retryPlayerLoad}
                            onReset={resetPlayerSession}
                        />
                    ) : !playerUuid ? (
                        <>
                            <CreatePlayer
                                username={usernameInput}
                                setUsername={setUsernameInput}
                                onCreate={handleCreatePlayer}
                                loading={playerCreationStatus === "pending"}
                                blocked={playerCreationStatus === "uncertain"}
                            />
                            {playerCreationStatus === "error" && (
                                <p role="alert" className="mx-6 text-red-300">
                                    {playerCreationError?.message || "No se pudo crear el jugador."}
                                </p>
                            )}
                            {playerCreationStatus === "uncertain" && (
                                <div role="alert" className="mx-6 text-amber-200">
                                    <p>No se pudo confirmar si el jugador fue creado. Restablece la sesión antes de intentarlo otra vez.</p>
                                    <button type="button" onClick={resetPlayerSession}>Restablecer sesión local</button>
                                </div>
                            )}
                        </>
                    ) : monstersLoading && monsters.length === 0 ? (
                        <p role="status">Cargando monstruos...</p>
                    ) : monstersError ? (
                        <LoadError message="No se pudieron cargar los monstruos." onRetry={retryMonsters}/>
                    ) : monsters.length === 0 ? (
                        <p className="mx-6 text-gray-300">Tu colección todavía no tiene monstruos.</p>
                    ) : (
                        <MonsterList monsters={monsters} />
                    )}
                </main>
            </div>
        </div>
    );
}

function LoadError({message, onRetry, onReset}) {
    return (
        <div role="alert">
            <p>{message}</p>
            <button type="button" onClick={onRetry}>Reintentar</button>
            {onReset && (
                <button type="button" onClick={onReset}>Restablecer sesión local</button>
            )}
        </div>
    );
}

export default HomePage
