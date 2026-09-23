import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/api.js", () => ({
    getMonsterInfoById: vi.fn()
}));

import { getMonsterInfoById } from "../services/api.js";
import MonsterDetailPage from "./MonsterDetailPage.jsx";

const MONSTER = {
    id: 1,
    name: "slime",
    display_name: "Slime",
    image_path: "monsters/slime.png",
    type: "slime",
    tier: 0,
    nickname: null,
    max_hp: 10,
    atk: 2,
    spd: 3,
    aim: 4,
    recipes: []
};

function deferred() {
    let resolve;
    const promise = new Promise(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

function renderDetail(path = "/monster/1", extra = null) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            {extra}
            <Routes>
                <Route path="/monster/:id" element={<MonsterDetailPage />} />
                <Route path="/" element={<p>Inicio</p>} />
            </Routes>
        </MemoryRouter>
    );
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("monster detail recovery", () => {
    it("renders a valid detail response", async () => {
        getMonsterInfoById.mockResolvedValue({ monster: MONSTER });
        renderDetail();

        expect(screen.getByRole("status")).toHaveTextContent("Cargando monstruo");
        expect(await screen.findByRole("img", { name: "Slime" })).toBeInTheDocument();
        expect(screen.getByText("Este monstruo no tiene recetas conocidas.")).toBeInTheDocument();
    });

    it.each([
        [400, "El enlace del monstruo no es válido."],
        [404, "Este monstruo no existe o ya fue consumido."],
        [200, "El servidor devolvió datos de monstruo no válidos."]
    ])("renders terminal status %s with Home recovery", async (status, message) => {
        getMonsterInfoById.mockRejectedValue(Object.assign(new Error("Request failed"), { status }));
        renderDetail("/monster/invalid");

        expect(await screen.findByRole("alert")).toHaveTextContent(message);
        expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
    });

    it.each([
        [new TypeError("Failed to fetch"), "network failure"],
        [Object.assign(new Error("Request timed out"), { code: "REQUEST_TIMEOUT", status: null }), "timeout"],
        [Object.assign(new Error("Server failed"), { status: 500 }), "server failure"]
    ])("offers retry after %s", async error => {
        getMonsterInfoById
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce({ monster: MONSTER });
        const user = userEvent.setup();
        renderDetail();

        expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el monstruo.");
        await user.click(screen.getByRole("button", { name: "Reintentar" }));

        expect(await screen.findByRole("img", { name: "Slime" })).toBeInTheDocument();
        expect(getMonsterInfoById).toHaveBeenCalledTimes(2);
    });

    it("cancels stale detail rendering during rapid navigation", async () => {
        const firstRequest = deferred();
        const signals = [];
        getMonsterInfoById.mockImplementation((id, { signal }) => {
            signals.push(signal);
            return id === "1"
                ? firstRequest.promise
                : Promise.resolve({ monster: { ...MONSTER, id: 2, display_name: "Fire" } });
        });
        const user = userEvent.setup();
        renderDetail("/monster/1", <Link to="/monster/2">Siguiente</Link>);
        await waitFor(() => expect(getMonsterInfoById).toHaveBeenCalledOnce());

        await user.click(screen.getByRole("link", { name: "Siguiente" }));
        expect(await screen.findByRole("img", { name: "Fire" })).toBeInTheDocument();
        expect(signals[0].aborted).toBe(true);

        await act(async () => {
            firstRequest.resolve({ monster: MONSTER });
            await firstRequest.promise;
        });

        expect(screen.getByRole("img", { name: "Fire" })).toBeInTheDocument();
        expect(screen.queryByRole("img", { name: "Slime" })).not.toBeInTheDocument();
    });
});
