import {createContext,useContext,useEffect,useRef,useState} from "react";

import { createPlayer } from "../services/api";

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {

    const [playerUuid, setPlayerUuid] = useState(null);
    const [username, setUsername] = useState("");
    const [playerLoading, setPlayerLoading] = useState(true);

    const initializing = useRef(false);

    useEffect(() => {

        if (initializing.current) {
            return;
        }

        initializing.current = true;
        initializePlayer();
    }, []);


    async function initializePlayer() {

        console.log("HEY")
        try {
            const storedUuid = localStorage.getItem("playerUuid");
            const storedUsername = localStorage.getItem("username");

            if (!storedUuid) {return;}
            
            setPlayerUuid(storedUuid);
            setUsername(storedUsername || "");
        } catch (error) {
            console.error(error);
        } finally {
            console.log("WAKA")
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

            localStorage.setItem(
                "username",
                player.username
            );

            setPlayerUuid(player.uuid);
            setUsername(player.username);

            return player;
        } catch (error) {
            console.error(error);
            throw error;
        }
    }


    return (
        <PlayerContext.Provider
            value={{
                playerUuid,
                username,
                playerLoading,
                createNewPlayer
            }}
        >
            {children}
        </PlayerContext.Provider>
    );
}


export function usePlayer() {
    return useContext(PlayerContext);
}