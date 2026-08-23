import { usePlayer } from "../../context/PlayerContext";



export function Navbar() {

    const {playerUuid,username} = usePlayer();


    return (
        
        <nav  className="p-4 bg-indigo-700 font-bold text-center text-slate-200">


            {playerUuid ? (
                <p>
                    {username}
                </p>
            ) : (
                <p>Guest</p>
            )}

        </nav>
    );
}