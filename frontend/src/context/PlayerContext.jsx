import {createContext,useContext,useEffect,useRef,useState} from "react";

import { createPlayer } from "../services/api";

import { getPlayerMonsters, getPlayerByUuid} from "../services/api";

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {

    const [playerUuid, setPlayerUuid] = useState(null);

    const [player, setPlayer] = useState(null);
    const [playerLoading, setPlayerLoading] = useState(true);


    const [monsters, setMonsters] = useState([]);

    const initializing = useRef(false);

    useEffect(() => {
        if (!playerUuid) {
            return;
        }

        refreshMonsters();
    }, [playerUuid]);


    useEffect(() => {
        if (initializing.current) {
            return;
        }

        initializing.current = true;
        initializePlayer();
    }, []);

    useEffect(() => {
        const storedUuid = localStorage.getItem("playerUuid");

        if (!storedUuid) {
            setPlayerLoading(false);
            return;
        }

        loadPlayer(storedUuid);
    }, []);


    
    async function loadPlayer(uuid) {
        try {
            const response = await getPlayerByUuid(uuid);

            setPlayer(response.player);
        } catch (error) {
            console.error(error);
        }
    }



    async function initializePlayer() {


        try {
            const storedUuid = localStorage.getItem("playerUuid");
            if (!storedUuid) {return;}
            
            setPlayerUuid(storedUuid);
        } catch (error) {
            console.error(error);
        } finally {

            setPlayerLoading(false);
        }
    }


    async function createNewPlayer(usernameInput) {

        if (!usernameInput.trim()) {return;}

        try {
            const { player } = await createPlayer(usernameInput.trim());


            localStorage.setItem(
                "playerUuid",
                player.uuid
            );

            setPlayerUuid(player.uuid);
            return player;
        } catch (error) {
            console.error(error);
            throw error;
        }
    }


    async function refreshMonsters(uuid = playerUuid) {
        if (!uuid) {
            return;
        }

        try {
            const response = await getPlayerMonsters(uuid);

            setMonsters(response.monsters);

        } catch (error) {
            console.error(error);
        } 
    }


    async function refreshPlayer() {
        if (!player?.uuid) {
            return;
        }

        try {
            const response = await getPlayerByUuid(player.uuid);

            setPlayer(response.player);
        } catch (error) {
            console.error(error);
        }
    }



    return (
        <PlayerContext.Provider
            value={{
                playerUuid,
                playerLoading,
                createNewPlayer,
                monsters,
                refreshMonsters,

                player,
                refreshPlayer
            }}
        >
            {children}
        </PlayerContext.Provider>
    );
}


export function usePlayer() {
    return useContext(PlayerContext);
}