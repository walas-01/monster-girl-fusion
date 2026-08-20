import { useEffect, useState } from "react";
import { useParams } from "react-router";

import {getMonsterInfoById} from "../services/api.js"

import {getImage} from "../imageHandler.js"

function MonsterDetailPage() {
    const { id } = useParams();

    const [loading, setLoading] = useState(true);
    const [monsterState, setMonsterState] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        getMonster();
    }, [id]);

    async function getMonster() {
        try {
            setLoading(true);
            setError(null);
            setMonsterState(null);

            const response = await getMonsterInfoById(id);

            setMonsterState(response.monster);
            console.log(response.monster)
        } catch (error) {
            console.error(error);
            setError("Could not load monster.");

        } finally {
            setLoading(false);
        }
    }


    return (
        <div className="min-h-screen bg-gray-900 text-white">

            <div className="w-full min-h-screen md:min-h-[844px] md:max-w-[390px] bg-gray-900 text-gray-900 md:shadow-2xl overflow-hidden flex flex-col">

                <header className="p-4 bg-slate-100 font-bold text-center">
                    idk man
                </header>

                <main className="text-white">
                    {loading ? (
                        <p>Loading...</p>
                    ) : error ? (
                        <p>{error}</p>
                    ) : <DetailScreen monster={monsterState}/> }
                </main>
            </div>
        </div>
    );
}


function DetailScreen({monster}){
    return(
        <div className="flex-col m-4 text-black">
            <div className="bg-white rounded-md flex">

                <img src={getImage(monster.image_path)}alt={monster.name} className="mb-4 sprite-borde object-contain w-1/2"/>

                <div className="w-1/2 flex flex-col items-center">
                    <p className="text-lg font-bold">{monster.display_name}</p>
                    <span className="text-sm">Tier {monster.tier} {monster.display_name}</span>

                    <div className="mt-2 ">
                        <Stat stat={"HP"} value={monster.max_hp}/>
                        <Stat stat={"SPD"} value={monster.spd}/>
                        <Stat stat={"ATK"} value={monster.atk}/>
                        <Stat stat={"AIM"} value={monster.aim}/>
                    </div>

                </div>

            </div>

            <div className="bg-white rounded-md mt-4 text-center">

                {  monster.recipes == [] ? <p>si tiene</p> : <p className="py-6 text-xs">Este monstruo no tiene recetas!</p>}

                
            </div>


        </div>
    )
}


function Stat({stat,value}){
    return(
        <div className="flex gap-1 text-black">
            <img src={getImage("/icons/icon_aim.png")}alt={stat}/>
            <p> <img src={getImage("/icons/icon_aim.png")} alt="caca" /> {stat}: {value} </p>
        </div>  
    )
}



export default MonsterDetailPage

