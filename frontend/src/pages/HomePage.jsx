
import { useEffect, useState,useRef } from "react";
import {getPlayerMonsters} from "../services/api.js";
import { usePlayer } from "../context/PlayerContext.jsx";
import { Link } from "react-router";


import MonsterList from '../components/MonsterItem/MonsterList.jsx'
import CreatePlayer from '../components/player/CreatePlayer.jsx'



import { getImage } from "../imageHandler.js";



function HomePage() {

    const { playerUuid, playerLoading, monsters,createNewPlayer } = usePlayer();

    const [usernameInput, setUsernameInput] = useState("");
    const [creatingPlayer, setCreatingPlayer] = useState(false);


        



    async function handleCreatePlayer() {
        if (!usernameInput.trim()) {
            return;
        }

        try {
            setCreatingPlayer(true);
            await createNewPlayer(usernameInput);

        } catch (error) {
            console.error(error);
        } finally {
            setCreatingPlayer(false);
        }
    }


  return (
        <div className="min-h-screen bg-gray-900 text-gray-300">
            <div className="w-full min-h-screen md:min-h-[844px] md:max-w-[390px] bg-black md:shadow-2xl overflow-hidden flex flex-col">

                

                <main className="flex-1 overflow-y-auto">

                    <div className="flex justify-around m-6 gap-5">

                        <Link  to={`/fusion`} className="w-2/4">
                            <div className="  bg-purple-500 p-2 rounded-xl flex flex-col items-center border-b-8 border-purple-700">
                                <img src={getImage("icons/icon_fusion.png")}alt={"monster_fusion"} className="h-20"/>
                                <p className="text-xl text-white font-bold">Fusinar</p>
                            </div>
                        </Link>

                        <Link to={`/portal`} className="w-2/4">
                            <div className=" bg-rose-500 p-2 rounded-xl flex flex-col items-center border-b-8 border-rose-800">
                                <img src={getImage("icons/icon_portal.png")}alt={"portal"} className="h-20"/>
                                <p className="text-xl text-white font-bold">Excursiones</p>
                            </div>
                        </Link>

                    </div>

                    
                    <p className="text-lg font-light mb-6 mx-2 border-b-1 border-gray-500">
                              Mis Monstuos
                    </p>


                    {playerLoading ? (
                        <p>Cargando...</p>
                    ) : !playerUuid ? (
                        <CreatePlayer username={usernameInput}setUsername={setUsernameInput} onCreate={handleCreatePlayer}loading={creatingPlayer}/>
                    ) : (
                        <MonsterList monsters={monsters} />
                    )}
                </main>
            </div>
        </div>
    );
}

export default HomePage
