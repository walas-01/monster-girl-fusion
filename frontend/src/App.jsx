import './App.css'

import { BrowserRouter, Routes, Route } from "react-router";

import HomePage from "./pages/HomePage";
import MonsterDetailPage from "./pages/MonsterDetailPage";

function App() {
    return (
        <BrowserRouter>
            <Routes>

                <Route path="/" element={<HomePage />} />

                <Route
                    path="/monster/:id"
                    element={<MonsterDetailPage />}
                />

            </Routes>
        </BrowserRouter>
    );
}

export default App
