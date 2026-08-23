
import { getImage } from "../../imageHandler.js";
import { Link } from "react-router";



function MonsterItem({monster}) {

  return (
    <Link to={`/monster/${monster.id}`}>
        <ItemType2 monster={monster}/>
    </Link>
    );
}


function ItemType1({monster}) {
  return (
        <div className="bg-slate-700  rounded-md   flex flex-col justify-around items-center" > 

            <div className="bg-indigo-500 text-white py-1  w-full flex flex-col justify-center items-center rounded-t-md">
                <p className=" font-bold">{monster.nickname}</p>
            </div>

            <div className="flex">
                <div className=" rounded-l w-1/2">
                    <img src={getImage(monster.image_path)}alt={monster.name} className=" sprite-borde object-contain mb-5"/>
                </div>
               
                <div className="w-1/2 flex flex-col justify-center items-center gap-0.5">
                
                    <span className="text-xs mb-1 text-center" >Tier {monster.tier} {monster.display_name}</span>

                    
                        <div className="flex items-center gap-1">
                            <img src={getImage("icons/icon_hp.png")} alt="caca" className="w-4 h-4 flex"/>
                            <p className="font-bold"> {monster.max_hp}</p>
                        </div>

                        <div className="flex items-center gap-1">
                            <img src={getImage("icons/icon_atk.png")} alt="caca" className="w-4 h-4 flex"/>
                            <p className="font-bold"> {monster.atk}</p>
                        </div>

                        <div className="flex items-center gap-1">
                            <img src={getImage("icons/icon_spd.png")} alt="caca" className="w-4 h-4 flex"/>
                            <p className="font-bold"> {monster.spd}</p>
                        </div>

                        <div className="flex items-center gap-1">
                            <img src={getImage("icons/icon_aim.png")} alt="caca" className="w-4 h-4 flex"/>
                            <p className="font-bold"> {monster.aim}</p>
                        </div>

                </div>

            </div>
        </div>
    );
}


function ItemType2({monster}) {
  return (
        <div className="bg-slate-700  rounded-md gap-2 flex items-center justify-between" > 

            <div className="gap-2 flex items-center">
                <div className=" rounded-l w-20">
                        <img src={getImage(monster.image_path)}alt={monster.name} className=" sprite-borde object-contain mb-3"/>
                </div>

                <div className="flex flex-col items-center w-full">

                    <div className="flex items-center gap-1 w-full">
                        <p className="font-bold text-md">{monster.nickname}</p>
                        -
                        <span className="text-xs not-only:text-center" >Tier {monster.tier} {monster.display_name}</span>
                    </div>

                    <div className="flex items-center gap-4 w-full">

                        <div className="flex items-center gap-1">
                                <img src={getImage("icons/icon_hp.png")} alt="caca" className="sprite-borde w-5 h-5 flex"/>
                                <p className="font-bold"> {monster.max_hp}</p>
                            </div>

                            <div className="flex items-center gap-1">
                                <img src={getImage("icons/icon_atk.png")} alt="caca" className="sprite-borde w-5 h-5 flex"/>
                                <p className="font-bold"> {monster.atk}</p>
                            </div>

                            <div className="flex items-center gap-1">
                                <img src={getImage("icons/icon_spd.png")} alt="caca" className="sprite-borde w-5 h-5 flex"/>
                                <p className="font-bold"> {monster.spd}</p>
                            </div>

                            <div className="flex items-center gap-1">
                                <img src={getImage("icons/icon_aim.png")} alt="caca" className="sprite-borde w-5 h-5 flex"/>
                                <p className="font-bold"> {monster.aim}</p>
                            </div>
                    </div>
                </div>
            </div>
        

            <div className=" bg-indigo-600 text-gray-300 px-3 py-6 mr-1 rounded-r-md text-xl font-extrabold">
                <img src={getImage("icons/icon_arrow.png")} alt="caca" className="w-3"/>
            </div>

        </div>
    );
}




export default MonsterItem


