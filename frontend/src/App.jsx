import './App.css'

import MonsterList from './components/MonsterItem/MonsterList.jsx'


function App() {


  return (
        <div className="min-h-screen bg-gray-900 text-white">

            <div className="w-full min-h-screen md:min-h-[844px] md:max-w-[390px] bg-gray-700 text-gray-900 md:shadow-2xl overflow-hidden flex flex-col">

                <header className="p-4 bg-slate-100 font-bold text-center">
                Mi App Móvil
                </header>

                



                <main className="flex-1 overflow-y-auto">
                    <MonsterList />
                </main>



                <nav className="p-4 bg-slate-100 border-t border-gray-200 text-center">
                Navegación Inferior
                </nav>

            </div>


        </div>
    );
}

export default App
