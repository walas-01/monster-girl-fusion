import './App.css'

import { BrowserRouter, Link, Routes, Route } from "react-router";

import HomePage from "./pages/HomePage";
import MonsterDetailPage from "./pages/MonsterDetailPage";
import PortalPage from './pages/PortalPage';
import FusionPage from './pages/FusionPage';
import { Navbar } from './components/Player/Navbar';

import { PlayerProvider } from './context/PlayerContext.jsx';


function App() {
    return (
        <BrowserRouter>
            <PlayerProvider>
                <Navbar/>


                <Routes>

                    <Route path="/" element={<HomePage />}/>

                    <Route path="/portal"element={<PortalPage />}/>

                    <Route path="/fusion"element={<FusionPage />}/>

                    <Route path="/monster/:id"element={<MonsterDetailPage />}/>

                    <Route path="*" element={<NotFound />}/>

                </Routes>
            </PlayerProvider>
        </BrowserRouter>
    );
}

function NotFound() {
    return (
        <main>
            <h1>Página no encontrada</h1>
            <Link to="/">Volver al inicio</Link>
        </main>
    );
}

export default App
