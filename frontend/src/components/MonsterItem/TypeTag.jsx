
import { getImage } from "../../imageHandler.js";


const TYPE_CONFIG = {
  none: {
    image_path: "icons/icon_normal.png",
    text: "Normal",
    color: "bg-slate-400",
  },
  fur: {
    image_path: "icons/icon_fur.png",
    text: "Peluda",
    color: "bg-orange-400",
  },
  feathers: {
    image_path: "icons/icon_feather.png",
    text: "Alada",
    color: "bg-sky-600",
  },
  quills: {
    image_path: "icons/icon_quills.png",
    text: "Pinchuda",
    color: "bg-teal-600",
  },
  slime: {
    image_path: "icons/icon_slime.png",
    text: "Babosa",
    color: "bg-pink-400",
  },
  scales: {
    image_path: "icons/icon_scales.png",
    text: "Escamosa",
    color: "bg-lime-600",
  },
  synthetic: {
    image_path: "icons/icon_synthetic.png",
    text: "Sintética",
    color: "bg-stone-500",
  },
};

function TypeTag({ type, showText = true }) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.none;

  return (
    <div
      className={`${config.color}  text-white text-xs flex items-center justify-center w-fit rounded-xl p-1 ${
        showText ? "px-2 gap-1" : "rounded-full"
      }`}
    >
      <img src={getImage(config.image_path)} alt="type" className="w-5 h-5 object-contain" />
      {showText && <p className="whitespace-nowrap">{config.text}</p>}
    </div>
  );
}



export default TypeTag


