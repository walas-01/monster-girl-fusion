import './App.css'

import { BrowserRouter, Routes, Route } from "react-router";

import HomePage from "./pages/HomePage";
import MonsterDetailPage from "./pages/MonsterDetailPage";
import PortalPage from './pages/PortalPage';
import FusionPage from './pages/FusionPage';
import { Navbar } from './components/Player/Navbar';

import { PlayerProvider } from './context/PlayerContext';


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

                </Routes>
            </PlayerProvider>
        </BrowserRouter>
    );
}

export default App
