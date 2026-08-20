
import { getImage } from "../../imageHandler.js";

import { Link } from "react-router";



function MonsterItem({monster}) {

  return (
    <Link to={`/monster/${monster.id}`}>
        <div className="bg-indigo-200 text-gray-900 rounded-md   flex flex-col justify-around items-center" > 

            <div className="bg-indigo-500 text-white py-1  w-full flex flex-col justify-center items-center rounded-t-md">
                <p className=" font-bold">{monster.nickname}</p>
                
            </div>

            <div className="flex ">
                <div className="bg-white rounded-l w-1/2">
                    <img src={getImage(monster.image_path)}alt={monster.name} className="  sprite-borde  object-contain"/>
                </div>
               
                <div className="w-1/2 flex flex-col justify-center items-center gap-0.5">
                    <span className="text-xs mb-1" >Tier {monster.tier} {monster.display_name}</span>
                    <span className="text-sm font-bold">HP {monster.max_hp}</span>
                    <span className="text-sm font-bold">SPD {monster.spd}</span>
                    <span className="text-sm font-bold">ATK {monster.atk}</span>
                    <span className="text-sm font-bold">AIM {monster.aim}</span>
                </div>

            </div>
            


        </div>
    </Link>
        
    );
}

export default MonsterItem


