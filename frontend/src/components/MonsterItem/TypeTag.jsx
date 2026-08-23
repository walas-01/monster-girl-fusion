
import { getImage } from "../../imageHandler.js";


function TypeTag({type}) {

    const TYPE_CONFIG = {
        none: {
            image_path: "icons/icon_normal.png",
            text:"Normal",
            color: "bg-slate-400",
        },
        feathers: {
            image_path: "icons/icon_feather.png",
            text:"Alada",
            color: "bg-sky-600",
        },
        quills: {
            image_path: "icons/icon_quills.png",
            text:"Pinchuda",
            color: "bg-teal-600",
        },
        slime: {
            image_path: "icons/icon_slime.png",
            text:"Babosa",
            color: "bg-pink-400",
        },
        scales: {
            image_path: "icons/icon_scales.png",
            text:"Escamosa",
            color: "bg-lime-600",
        },
        synthetic: {
            image_path: "icons/icon_synthetic.png",
            text:"Sintética",
            color: "bg-stone-500",
        }
    };

    const config = TYPE_CONFIG[type] || TYPE_CONFIG.none;

  return (
        <div className={`${config.color} text-white text-xs  flex items-center w-fit rounded-xl p-1 px-2 gap-1`}>
            <img src={getImage(config.image_path)} alt="type" className="w-4" />
            <p>{config.text}</p>
        </div>
    );
}



export default TypeTag


