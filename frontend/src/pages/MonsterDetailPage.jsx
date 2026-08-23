import { useEffect, useState } from "react";
import { useParams } from "react-router";

import {getMonsterInfoById} from "../services/api.js"

import {getImage} from "../imageHandler.js"

import TypeTag from "../components/MonsterItem/TypeTag.jsx";




function MonsterDetailPage() { // ------------------------------------------------------ main
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
        } catch (error) {
            console.error(error);
            setError("Could not load monster.");

        } finally {
            setLoading(false);
        }
    }


    return (
        <div className="min-h-screen bg-gray-600 text-gray-300">
            <div className="w-full min-h-screen md:min-h-[844px] md:max-w-[390px] bg-black not-even:md:shadow-2xl overflow-hidden flex flex-col">

                <main className="">
                    {loading ? (
                        <p>Loading...</p>
                    ) : error ? (
                        <p>{error}</p>
                    ) : <DetailScreen monster={monsterState}/> }
                </main>

            </div>
        </div>
    );
} // -------------------------------------------------------------------------------


function DetailScreen({monster}){
    return(
        <div className="flex-col m-4">
            <div className="bg-slate-700  rounded-md flex">

                <img src={getImage(monster.image_path)}alt={monster.name} className="mb-4 sprite-borde object-contain w-1/2"/>

                <div className="mt-2 w-1/2 flex flex-col">

                    <div className=" flex flex-col items-center">
                        <p className="text-xl font-bold">{monster.display_name}</p>

                        <div className="flex gap-4 items-center">
                            <TypeTag type={monster.type}/>

                            <span className="text-sm font-bold">
                                Tier {monster.tier} 
                            </span>

                        </div>
                    </div>

                    

                    <div className="mt-4 flex flex-col gap-3 w-full">
                        <Stat stat={"HP"} value={monster.max_hp} max_value={180} img={"icons/icon_hp.png"}/>
                        <Stat stat={"SPD"} value={monster.spd} max_value={25} img={"icons/icon_spd.png"}/>
                        <Stat stat={"ATK"} value={monster.atk} max_value={40} img={"icons/icon_atk.png"}/>
                        <Stat stat={"AIM"} value={monster.aim} max_value={11} img={"icons/icon_aim.png"}/>
                    </div>
                </div>

            </div>

            <div className="mt-4">
                {monster.recipes?.length > 0 ? (
                    <>
                        <p className="text-lg font-light mb-6 border-b-1 border-gray-500">
                              R e c e t a s  
                        </p>

                        {monster.recipes.map((recipe, index) => (
                            <RecipeItem key={index} recipe={recipe}  resultMonster={monster}/>
                        ))}
                    </>
                ) : (
                    <div className="bg-slate-700 rounded-md p-5 flex flex-col items-center">
                        <p className="">
                            Esta monstruo no tiene recetas!
                        </p>
                        <p className="text-xs text-gray-6">
                            Consigue esta monstruo haciendo <span className="font-bold">Excursiones</span>  
                        </p>
                    </div>
                )}
            </div>

        </div>
    )
}


function Stat({stat,value,img,max_value}){
    return(
        <div className="flex justify-evenly">

            <div className="flex items-center gap-1">
                <img src={getImage(img)} alt="caca" className="sprite-borde w-5 h-5 flex"/>
                <p className="font-bold"> {stat}</p>
            </div>
            
            <div className="flex flex-col items-start">
                <p className="text-xs"> {value} </p>

                <div className="w-25 bg-gray-300 h-2 rounded-full overflow-hidden">
                    <div
                    className="bg-indigo-400 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${ (100 *value)/max_value }%` }}
                    />
                </div>

            </div>
            
        </div>  
    )
}

function RecipeItem({recipe,resultMonster}){



    return(
        <div className="flex justify-around items-center bg-slate-700 rounded-md pb-4  text-center">

            <div className="flex flex-col items-center">
                <img src={getImage(recipe.parent1.image_path)}alt={recipe.parent1.display_name} className="mb-2 sprite-borde w-20"/>
                <p className="bg-indigo-500 text-white rounded-xl px-2 max-w-20 font-light text-xs">{recipe.parent1.display_name}</p>
            </div>

            <p className="font-bold text-xl">+</p>
            
            <div className="flex flex-col items-center">
                <img src={getImage(recipe.parent2.image_path)}alt={recipe.parent2.display_name} className="mb-2 sprite-borde w-20"/>
                <p className="bg-indigo-500 text-white rounded-xl px-2 max-w-20 font-light text-xs">{recipe.parent2.display_name}</p>
            </div>

            <p className="font-bold text-xl">{"->"}</p>

            <div className="flex flex-col items-center">
                <img src={getImage(resultMonster.image_path)}alt={resultMonster.display_name} className="mb-2 sprite-borde w-20"/>
                <p className="bg-indigo-500 text-white rounded-xl px-2 max-w-20 font-light text-xs">{resultMonster.display_name}</p>
            </div>

            

        </div>
    )
}


export default MonsterDetailPage

