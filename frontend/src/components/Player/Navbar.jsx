import { usePlayer } from "../../context/PlayerContext.js";
import { Link } from "react-router";



export function Navbar() {

    const {playerLoading,playerError,player} = usePlayer();

    return (
        
        <nav className="p-4 bg-indigo-700 font-bold text-center text-slate-200">

            <Link to="/">
                {playerLoading ? (
                    <span>Cargando...</span>
                ) : player ? (
                    <span>{player.username}</span>
                ) : playerError ? (
                    <span>Jugador no disponible</span>
                ) : (
                    <span>Invitado</span>
                )}
            </Link>

        </nav>
    );
}
