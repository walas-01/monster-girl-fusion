import { getImage } from "../../imageHandler"



export function Stat({stat,value,img,max_value}){
    return(
        <div className="flex justify-evenly gap-3">

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
