
import { useState } from "react";
import { getImage } from "../imageHandler";

function PortalPage() {
    const [loading, setLoading] = useState(true);


  return (
        <div className="min-h-screen bg-gray-900 text-gray-300">

            <div className="w-full min-h-screen md:min-h-[844px] md:max-w-[390px] bg-black md:shadow-2xl overflow-hidden flex flex-col">

                <header className="p-4 bg-indigo-700 font-bold text-center">
                    Excursion
                </header>

                <main className="flex-1 overflow-y-auto">

                 
                    <p className="text-lg font-light my-6 mx-2 border-b-1">
                        Excursiones
                    </p>

                    <div className="flex flex-col p-4 gap-5">
                        <ExpeditionItem dificulty={"easy"} iconPath={"icon_expedition_easy"} />
                        <ExpeditionItem dificulty={"normal"} iconPath={"icon_expedition_normal"} />
                        <ExpeditionItem dificulty={"hard"} iconPath={"icon_expedition_hard"} />
                        <ExpeditionItem dificulty={"very_hard"} iconPath={"icon_expedition_very_hard"} />
                    </div>

                </main>
            </div>
        </div>
    );
}


function ExpeditionItem({dificulty,iconPath}){

    let zone;
    let dif;
    let tier;
    let color;

    if(dificulty == "easy"){
        dif = "Fácil";
        zone = "Granja";
        tier = 1;
        color = "emerald"
    }else if(dificulty == "normal"){
        dif = "Normal";
        zone = "Bosque";
        tier = 2;
        color = "blue"
    }else if(dificulty == "hard"){
        dif = "Dificil";
        zone = "Cueva";
        tier = 3;
        color = "rose"
    }else if(dificulty == "very_hard"){
        dif = "Muy Difícil";
        zone = "Castillo";
        tier = 4;
        color = "purple"
    }


    return(
        <div className="bg-slate-700 rounded-l-xl flex justify-between p-2">

            <div className="flex gap-2">

                <div className={`bg-${color}-600 rounded-l-xl`}>
                    <img src={getImage(`icons/${iconPath}.png`)}alt={"dificulty"} className=" h-16 m-3"/>
                </div>

                <div className="flex flex-col justify-center">
                    <p className="font-bold flex items-center">
                        {zone} - <span className="font-light text-sm ml-1"> {dif}</span> 
                    </p>
                    <p className="font-light text-sm">
                        Consigue monstruos de <span className="font-bold"> Tier {tier}</span> 
                    </p>
                </div>

                

            </div>

            <div className={`bg-${color}-600 text-gray-300 px-3 py-6 text-xl font-extrabold flex`}>
                <img src={getImage("icons/icon_arrow.png")} alt="arrow" className="w-3"/>
            </div>
            
        </div>
    );
}

export default PortalPage