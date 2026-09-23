import { createContext, useContext } from "react";

export const PlayerContext = createContext(null);

export function usePlayer() {
    return useContext(PlayerContext);
}
