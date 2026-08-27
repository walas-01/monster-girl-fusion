
import { getImage } from "../../imageHandler.js";
import { Link } from "react-router";

import TypeTag from "./TypeTag.jsx";


function MonsterItem({monster}) {

  return (
    <Link to={`/monster/${monster.id}`}>
        <ItemType2 monster={monster}/>
    </Link>
    );
}



function ItemType2({monster}) {

  return (
        <div className="bg-slate-800  rounded-md gap-2 flex items-center justify-between" > 

            <div className="gap-2 flex items-center">
                <div className=" rounded-l w-20">
                        <img src={getImage(monster.image_path)}alt={monster.name} className=" sprite-borde object-contain mb-3"/>
                </div>

                <div className="flex flex-col w-full gap-1">

                    <div className="flex items-center gap-2 w-full">
                        <p className="font-bold text-md">{monster.display_name}</p>
                        -
                        <span className="text-sm" >Tier {monster.tier} </span>
                    </div>

                    <div className="flex items-center gap-2 w-full">

                            <TypeTag type={monster.type}/>

                            <div className="flex items-center gap-1">
                                <img src={getImage("icons/icon_hp.png")} alt="caca" className="sprite-borde w-4 flex"/>
                                <p className="font-bold"> {monster.max_hp}</p>
                            </div>

                            <div className="flex items-center gap-1">
                                <img src={getImage("icons/icon_atk.png")} alt="caca" className="sprite-borde w-3 flex"/>
                                <p className="font-bold"> {monster.atk}</p>
                            </div>

                            <div className="flex items-center gap-1">
                                <img src={getImage("icons/icon_spd.png")} alt="caca" className="sprite-borde w-3 flex"/>
                                <p className="font-bold"> {monster.spd}</p>
                            </div>

                            <div className="flex items-center gap-1">
                                <img src={getImage("icons/icon_aim.png")} alt="caca" className="sprite-borde w-3 flex"/>
                                <p className="font-bold"> {monster.aim}</p>
                            </div>
                    </div>
                </div>
            </div>
        

            <div className=" bg-indigo-600 text-gray-300 px-3 py-2 mr-3 rounded-full font-extrabold">
                <img src={getImage("icons/icon_arrow.png")} alt="caca" className="w-2"/>
            </div>

        </div>
    );
}




export default MonsterItem


