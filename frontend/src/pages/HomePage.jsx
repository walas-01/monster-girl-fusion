

import { useEffect, useState,useRef } from "react";
import {createPlayer,getPlayerMonsters} from "../services/api.js";
import { Link } from "react-router";


import MonsterList from '../components/MonsterItem/MonsterList.jsx'
import CreatePlayer from '../components/player/CreatePlayer.jsx'

import { getImage } from "../imageHandler.js";



function HomePage() {
    const [myMonsters, setMyMonsters] = useState([]);
    const [loading, setLoading] = useState(true);

    const [playerUuid, setPlayerUuid] = useState(null);
    const [username, setUsername] = useState("");
    const [usernameInput, setUsernameInput] = useState("");
    const [creatingPlayer, setCreatingPlayer] = useState(false);

    const initializing = useRef(false);

    useEffect(() => {
        if (initializing.current) {
            return;
        }
        initializing.current = true;
        initializePlayer();
    }, []);


    async function initializePlayer() { // called at the start
        try {
            const storedUuid = localStorage.getItem("playerUuid");
            const storedUsername = localStorage.getItem("username");

            if (!storedUuid) {
                setLoading(false);
                return;
            }

            setPlayerUuid(storedUuid);
            setUsername(storedUsername);

            const response = await getPlayerMonsters(storedUuid);

            setMyMonsters(response.monsters);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreatePlayer() { /// Create player when pressing button
        console.log("[!] CREATING PLAYER")

        if (!usernameInput.trim()) {
            return;
        }

        try {
            setCreatingPlayer(true);

            const { player } = await createPlayer(usernameInput.trim());

            console.log("Created player:", player);

            localStorage.setItem("playerUuid", player.uuid);
            localStorage.setItem("username", player.username);

            setPlayerUuid(player.uuid);
            setUsername(player.username);

            const response = await getPlayerMonsters(player.uuid);
            console.log(response.mosters)

            setMyMonsters(response.monsters);

        } catch (error) {
            console.error(error);
        } finally {
            setCreatingPlayer(false);
        }
    }


  return (
        <div className="min-h-screen bg-gray-900 text-gray-300">
            <div className="w-full min-h-screen md:min-h-[844px] md:max-w-[390px] bg-black md:shadow-2xl overflow-hidden flex flex-col">

                <header className="p-4 bg-indigo-700 font-bold text-center">
                {playerUuid == null ? "Mi App Móvil" : `Bienvenido, ${username}`}
                </header>

                <main className="flex-1 overflow-y-auto">

                    <div className="flex justify-around m-6 gap-5">

                        <Link  to={`/portal`} className="w-2/4">
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


                    {loading ? (
                        <p>Cargando...</p>
                    ) : !playerUuid ? (
                        <CreatePlayer username={usernameInput}setUsername={setUsernameInput} onCreate={handleCreatePlayer}loading={creatingPlayer}/>
                    ) : (
                        <MonsterList monsters={myMonsters} />
                    )}
                </main>

                

            </div>


        </div>
    );
}

export default HomePage
