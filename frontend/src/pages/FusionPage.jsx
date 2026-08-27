
import { getImage } from "../imageHandler";

import { usePlayer } from "../context/PlayerContext";
import TypeTag from "../components/MonsterItem/TypeTag";
import {  useState } from "react";
import { fuseMonsters } from "../services/api.js";

function FusionPage() {
    const { monsters,playerUuid,refreshMonsters,refreshPlayer } = usePlayer();

    const [selectedMonsters,setSelectedMonsters] = useState([]);

    const [fusionResult, setFusionResult] = useState(null);
    const [fusionError, setFusionError] = useState(null);



    const monsterClick = (monster,event)=>{
        if (selectedMonsters.some(mon => mon.name === monster.name)) return;

        if (selectedMonsters.length < 2){
            setSelectedMonsters(prevMonssters => [...prevMonssters, monster] );
        }else{
            setSelectedMonsters([monster]);
        }
    };


    const canFuse = selectedMonsters.length === 2;

    const fuseClick = async () => {

        if (!canFuse) { return;}

        setFusionResult(null);
        setFusionError(null);

        try {
            const response = await fuseMonsters(selectedMonsters[0].id,selectedMonsters[1].id,playerUuid);

            console.log(response.monster)


            setFusionResult(response.monster);
            setSelectedMonsters([]);
            
            await refreshMonsters();
            await refreshPlayer();
        } catch (error) {
            setFusionError(error.message);
        }
    };




  return (
        <div className=" bg-gray-950 text-gray-300">
            <div className="w-full bg-black overflow-hidden md:max-w-[390px]">

                <main className="flex-1 overflow-y-auto">
                    <FusionResultWindow
                        monster={fusionResult}
                        error={fusionError}
                        onClose={() => {
                            setFusionResult(null);
                            setFusionError(null);
                        }}
                    />
                
                    <div className="flex items-center justify-around p-3 bg-gray-900 text-gray-300 rounded-xl m-6">
                        <img src={getImage(selectedMonsters[0]? selectedMonsters[0].image_path : "monsters/default.png")} alt={selectedMonsters[0]?.name} className="sprite-borde w-35 h-35 mb-2"/>
                         
                        <button className={`flex flex-col items-center p-2 rounded-xl transition-colors border-indigo-800 ${canFuse ? "bg-indigo-500 hover:bg-indigo-600 cursor-pointer ": "bg-slate-800 cursor-not-allowed"}`} onClick={(e)=>{fuseClick(e)}} >
                            <img src={getImage("icons/icon_fuse.png")} alt="fuse" className="h-7"/>
                            <p className="font-bold text-sm" >¡Fusionar!</p>
                        </button>

                         <img src={getImage(selectedMonsters[1]? selectedMonsters[1].image_path : "monsters/default.png")} alt={selectedMonsters[1]?.name} className=" sprite-borde w-35 h-35 mb-2"/>
                    </div>

                    <p className="text-lg font-light mx-2 border-b-1 border-gray-500"> Mis Monstuos </p>

                    <div className="grid grid-cols-2 p-3 gap-2 max-h-[490px] overflow-y-auto ">
                        {monsters?.map((mon,index)=>
                            <MonItem selectedMonsters={selectedMonsters} key={mon.id} monster={mon} onSelec={ (e)=>{ monsterClick(mon,e) } }/>
                        )}
                    </div>

                </main>


            </div>
        </div>
    );
}


function MonItem({monster, selectedMonsters,onSelec}) {

   const isSelected = selectedMonsters?.some(mon => mon.id === monster.id);

    return (
        <div className={`flex text-gray-300 rounded-xl gap-1 ${isSelected ? "bg-indigo-800" : "bg-gray-800"}`} onClick={onSelec} >

            <img src={getImage(monster.image_path)}alt={monster.name} className=" sprite-borde w-20 h-20 mb-2"/>
           
            <div className="flex flex-col justify-center gap-2">
                <p className="text-sm">{monster.display_name}</p>
                <div className="flex gap-2">
                    <TypeTag type={monster.type} showText={false}/>
                    <span className="text-sm" >Tier {monster.tier} </span>
                </div>
            </div>

        </div>
    );
}

function FusionResultWindow({monster,error,onClose}) {

    if (!monster && !error) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50  bg-black/70 flex items-center justify-center">

            <div className="bg-gray-800 rounded-2xl p-6 w-80 text-center">

                {monster ? (

                    <>
                        <h2 className="text-2xl font-bold">
                            Fusion successful!
                        </h2>

                        <div>
                            <img src={getImage(monster.image_path)}alt={monster.name} className="sprite-borde w-20 h-20 mb-2"/>
                        </div>
                        <p className="text-xl text-white">
                            {monster.display_name}
                        </p>

                    </>

                ) : (

                    <>

                        <h2 className="text-xl font-bold ">
                            No no no. . .
                        </h2>

                    </>

                )}

                <button
                    onClick={onClose}
                    className="mt-6 bg-indigo-600 px-6 py-2 rounded-lg"
                >
                    Volver
                </button>

            </div>

        </div>
    );
}

export default FusionPage