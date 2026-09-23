import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../context/PlayerContext.js", () => ({
    usePlayer: vi.fn()
}));

import { usePlayer } from "../context/PlayerContext.js";
import HomePage from "./HomePage.jsx";

function context(overrides = {}) {
    return {
        playerUuid: null,
        playerLoading: false,
        playerError: null,
        retryPlayerLoad: vi.fn(),
        resetPlayerSession: vi.fn(),
        monsters: [],
        monstersLoading: false,
        monstersError: null,
        refreshMonsters: vi.fn().mockResolvedValue([]),
        createNewPlayer: vi.fn().mockResolvedValue(undefined),
        playerCreationStatus: "idle",
        playerCreationError: null,
        ...overrides
    };
}

function renderHome(value) {
    usePlayer.mockReturnValue(value);
    return render(<MemoryRouter><HomePage /></MemoryRouter>);
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("Home player creation", () => {
    it("submits the semantic form with Enter", async () => {
        const value = context();
        const user = userEvent.setup();
        renderHome(value);

        const input = screen.getByRole("textbox", { name: "Nombre del jugador" });
        await user.type(input, "Ada{Enter}");

        expect(value.createNewPlayer).toHaveBeenCalledOnce();
        expect(value.createNewPlayer).toHaveBeenCalledWith("Ada");
    });

    it("keeps whitespace-only and pending submissions disabled", async () => {
        const user = userEvent.setup();
        const { rerender } = renderHome(context());
        const input = screen.getByRole("textbox", { name: "Nombre del jugador" });
        const submit = screen.getByRole("button", { name: "Crear jugador" });

        expect(submit).toBeDisabled();
        await user.type(input, "   ");
        expect(submit).toBeDisabled();

        usePlayer.mockReturnValue(context({ playerCreationStatus: "pending" }));
        rerender(<MemoryRouter><HomePage /></MemoryRouter>);
        expect(screen.getByRole("button", { name: "Creando..." })).toBeDisabled();
    });

    it("renders confirmed creation errors while leaving retry available", async () => {
        const user = userEvent.setup();
        renderHome(context({
            playerCreationStatus: "error",
            playerCreationError: new Error("Nombre inválido")
        }));

        expect(screen.getByRole("alert")).toHaveTextContent("Nombre inválido");
        await user.type(screen.getByRole("textbox", { name: "Nombre del jugador" }), "Ada");
        expect(screen.getByRole("button", { name: "Crear jugador" })).not.toBeDisabled();
    });

    it("renders uncertain creation recovery and blocks resubmission", async () => {
        const value = context({ playerCreationStatus: "uncertain" });
        const user = userEvent.setup();
        renderHome(value);

        expect(screen.getByRole("alert")).toHaveTextContent("No se pudo confirmar");
        expect(screen.getByRole("button", { name: "Crear jugador" })).toBeDisabled();
        await user.click(screen.getByRole("button", { name: "Restablecer sesión local" }));
        expect(value.resetPlayerSession).toHaveBeenCalledOnce();
    });
});

describe("Home restoration and collection states", () => {
    it("offers retry and explicit reset for player restoration errors", async () => {
        const value = context({
            playerUuid: "123e4567-e89b-42d3-a456-426614174000",
            playerError: "Offline"
        });
        const user = userEvent.setup();
        renderHome(value);

        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent("No se pudo cargar el jugador.");
        await user.click(screen.getByRole("button", { name: "Reintentar" }));
        await user.click(screen.getByRole("button", { name: "Restablecer sesión local" }));
        expect(value.retryPlayerLoad).toHaveBeenCalledOnce();
        expect(value.resetPlayerSession).toHaveBeenCalledOnce();
    });

    it("announces player and collection loading", () => {
        const { rerender } = renderHome(context({ playerLoading: true }));
        expect(screen.getByRole("status")).toHaveTextContent("Cargando jugador");

        usePlayer.mockReturnValue(context({
            playerUuid: "123e4567-e89b-42d3-a456-426614174000",
            monstersLoading: true
        }));
        rerender(<MemoryRouter><HomePage /></MemoryRouter>);
        expect(screen.getByRole("status")).toHaveTextContent("Cargando monstruos");
    });

    it("renders a successful empty collection", () => {
        renderHome(context({
            playerUuid: "123e4567-e89b-42d3-a456-426614174000",
            monsters: []
        }));

        expect(screen.getByText("Tu colección todavía no tiene monstruos.")).toBeInTheDocument();
    });

    it("renders a populated collection", () => {
        renderHome(context({
            playerUuid: "123e4567-e89b-42d3-a456-426614174000",
            monsters: [{
                id: 1,
                name: "slime",
                display_name: "Slime",
                image_path: "monsters/slime.png",
                type: "water",
                tier: 0,
                max_hp: 10,
                atk: 2,
                spd: 3,
                aim: 4
            }]
        }));

        expect(screen.getByText("Slime")).toBeInTheDocument();
    });

    it("offers collection retry after a failure", async () => {
        const value = context({
            playerUuid: "123e4567-e89b-42d3-a456-426614174000",
            monstersError: "Offline"
        });
        const user = userEvent.setup();
        renderHome(value);

        expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los monstruos.");
        await user.click(screen.getByRole("button", { name: "Reintentar" }));
        expect(value.refreshMonsters).toHaveBeenCalledOnce();
    });
});
