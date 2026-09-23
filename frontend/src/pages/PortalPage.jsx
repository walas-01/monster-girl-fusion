import { getImage } from "../imageHandler.js";

const DIFFICULTY_CONFIG = {
    easy: {
        label: "Fácil",
        zone: "Granja",
        bgColor: "bg-emerald-600"
    },
    normal: {
        label: "Normal",
        zone: "Bosque",
        bgColor: "bg-blue-600"
    },
    hard: {
        label: "Difícil",
        zone: "Cueva",
        bgColor: "bg-rose-600"
    },
    very_hard: {
        label: "Muy difícil",
        zone: "Castillo",
        bgColor: "bg-purple-600"
    }
};

function PortalPage() {
    return (
        <div className="min-h-screen bg-gray-900 text-gray-300">
            <div className="w-full min-h-screen md:min-h-[844px] md:max-w-[390px] bg-black md:shadow-2xl overflow-hidden flex flex-col">
                <main className="flex-1 overflow-y-auto">
                    <p className="text-lg font-light my-6 mx-2 border-b-1">Excursiones</p>

                    <div className="flex flex-col p-4 gap-5">
                        <ExpeditionItem difficulty="easy" iconPath="icon_expedition_easy" />
                        <ExpeditionItem difficulty="normal" iconPath="icon_expedition_normal" />
                        <ExpeditionItem difficulty="hard" iconPath="icon_expedition_hard" />
                        <ExpeditionItem difficulty="very_hard" iconPath="icon_expedition_very_hard" />
                    </div>
                </main>
            </div>
        </div>
    );
}

function ExpeditionItem({ difficulty, iconPath }) {
    const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.easy;

    return (
        <div className="bg-slate-700 rounded-l-xl flex justify-between p-2">
            <div className="flex gap-2">
                <div className={`${config.bgColor} rounded-l-xl`}>
                    <img src={getImage(`icons/${iconPath}.png`)} alt="" className="h-16 m-3" />
                </div>

                <div className="flex flex-col justify-center">
                    <p className="font-bold flex items-center">
                        {config.zone} - <span className="font-light text-sm ml-1">{config.label}</span>
                    </p>
                    <p className="font-light text-sm">Próximamente</p>
                </div>
            </div>
        </div>
    );
}

export default PortalPage;
