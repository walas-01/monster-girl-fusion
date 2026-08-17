
import { getImage } from "../../imageHandler.js";





function MonsterItem({monster}) {



  return (
        <div className="bg-gray-100 text-gray-900 rounded-md pb-2   flex flex-col justify-around items-center" >

            <div className="bg-emerald-600 text-white py-1  w-full flex flex-col justify-center items-center rounded-t-md">
                <p className=" font-bold">{monster.nickname}</p>
                
            </div>

            <div className="flex ">
                <div className="bg-white rounded-l w-1/2">
                    <img src={getImage(monster.image_path)}alt={monster.name} className="  sprite-borde  object-contain"/>
                </div>
               
                <div className="w-1/2 flex flex-col justify-center items-center gap-0.5">
                    <p className="text-xs mb-1" >Tier {monster.tier} {monster.display_name}</p>
                    <p className="text-sm font-bold">HP {monster.max_hp}</p>
                    <p className="text-sm font-bold">SPD {monster.spd}</p>
                    <p className="text-sm font-bold">ATK {monster.atk}</p>
                    <p className="text-sm font-bold">AIM {monster.aim}</p>
                </div>

            </div>
            


        </div>
    );
}

export default MonsterItem


