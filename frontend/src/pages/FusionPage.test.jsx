import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../context/PlayerContext.js", () => ({
    usePlayer: vi.fn()
}));

import { usePlayer } from "../context/PlayerContext.js";
import FusionPage from "./FusionPage.jsx";

const MONSTERS = [
    {
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
    },
    {
        id: 2,
        name: "fire",
        display_name: "Fire",
        image_path: "monsters/fire.png",
        type: "fire",
        tier: 1,
        max_hp: 12,
        atk: 4,
        spd: 2,
        aim: 3
    },
    {
        id: 3,
        name: "ghost",
        display_name: "Ghost",
        image_path: "monsters/ghost.png",
        type: "dark",
        tier: 1,
        max_hp: 9,
        atk: 5,
        spd: 4,
        aim: 2
    }
];

function operation(overrides = {}) {
    return {
        status: "idle",
        parentIds: [],
        result: null,
        message: null,
        unresolved: false,
        noticeOpen: false,
        ...overrides
    };
}

function context(overrides = {}) {
    return {
        monsters: MONSTERS,
        monstersLoading: false,
        monstersError: null,
        player: { id: 1, username: "Ada" },
        playerLoading: false,
        playerError: null,
        retryPlayerLoad: vi.fn().mockResolvedValue(undefined),
        resetPlayerSession: vi.fn(),
        refreshMonsters: vi.fn().mockResolvedValue(MONSTERS),
        fusionOperation: operation(),
        submitFusion: vi.fn().mockResolvedValue(undefined),
        retryFusionReconciliation: vi.fn().mockResolvedValue(undefined),
        acknowledgeFusion: vi.fn(),
        ...overrides
    };
}

function renderFusion(value) {
    usePlayer.mockReturnValue(value);
    return render(<MemoryRouter><FusionPage /></MemoryRouter>);
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("Fusion route states", () => {
    it("announces player loading", () => {
        renderFusion(context({ player: null, playerLoading: true }));

        expect(screen.getByRole("status")).toHaveTextContent("Cargando jugador");
    });

    it("offers retry and reset after player restoration failure", async () => {
        const value = context({ player: null, playerError: "Offline" });
        const user = userEvent.setup();
        renderFusion(value);

        expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el jugador");
        await user.click(screen.getByRole("button", { name: "Reintentar" }));
        await user.click(screen.getByRole("button", { name: "Restablecer sesión local" }));
        expect(value.retryPlayerLoad).toHaveBeenCalledOnce();
        expect(value.resetPlayerSession).toHaveBeenCalledOnce();
    });

    it("links guests back to Home", () => {
        renderFusion(context({ player: null, monsters: [] }));

        expect(screen.getByText("Necesitas un jugador para fusionar monstruos.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
    });

    it("announces collection loading", () => {
        renderFusion(context({ monstersLoading: true }));

        expect(screen.getByRole("status")).toHaveTextContent("Cargando monstruos");
    });

    it("offers retry after a collection failure", async () => {
        const value = context({ monstersError: "Offline" });
        const user = userEvent.setup();
        renderFusion(value);

        expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los monstruos");
        await user.click(screen.getByRole("button", { name: "Reintentar" }));
        expect(value.refreshMonsters).toHaveBeenCalledOnce();
    });

    it("renders a valid empty collection", () => {
        renderFusion(context({ monsters: [] }));

        expect(screen.getByText("Tu colección todavía no tiene monstruos para fusionar.")).toBeInTheDocument();
    });
});

describe("Fusion selection and submission", () => {
    it("supports keyboard selection, deselection, and a disabled third choice", async () => {
        const user = userEvent.setup();
        renderFusion(context());
        const slime = screen.getByRole("button", { name: /Slime/ });
        const fire = screen.getByRole("button", { name: /Fire/ });
        const ghost = screen.getByRole("button", { name: /Ghost/ });

        slime.focus();
        await user.keyboard("{Enter}");
        fire.focus();
        await user.keyboard(" ");

        expect(slime).toHaveAttribute("aria-pressed", "true");
        expect(fire).toHaveAttribute("aria-pressed", "true");
        expect(ghost).toBeDisabled();
        expect(screen.getByText("Deselecciona un monstruo antes de elegir otro.")).toBeInTheDocument();

        await user.click(slime);
        expect(slime).toHaveAttribute("aria-pressed", "false");
        expect(ghost).not.toBeDisabled();
    });

    it("submits exactly the two selected IDs", async () => {
        const value = context();
        const user = userEvent.setup();
        renderFusion(value);

        await user.click(screen.getByRole("button", { name: /Slime/ }));
        await user.click(screen.getByRole("button", { name: /Fire/ }));
        await user.click(screen.getByRole("button", { name: "¡Fusionar!" }));

        expect(value.submitFusion).toHaveBeenCalledOnce();
        expect(value.submitFusion).toHaveBeenCalledWith([1, 2]);
    });

    it.each([
        ["pending", "Fusionando...", "Fusionando monstruos..."],
        ["reconciling", "Verificando...", "Verificando el resultado de la fusión..."]
    ])("renders the %s operation state", (status, buttonLabel, message) => {
        renderFusion(context({
            fusionOperation: operation({ status, parentIds: [1, 2], message })
        }));

        expect(screen.getByRole("button", { name: buttonLabel })).toBeDisabled();
        expect(screen.getByText(message)).toBeInTheDocument();
        expect(screen.getByText(message).closest("div[aria-live]")).toBeInTheDocument();
    });

    it("keeps unresolved reconciliation blocked with an inline retry", async () => {
        const value = context({
            fusionOperation: operation({
                status: "uncertain",
                parentIds: [1, 2],
                message: "No se pudo sincronizar.",
                unresolved: true,
                noticeOpen: false
            })
        });
        const user = userEvent.setup();
        renderFusion(value);

        expect(screen.getByRole("button", { name: "¡Fusionar!" })).toBeDisabled();
        expect(screen.getByRole("alert")).toHaveTextContent("No se pudo sincronizar");
        await user.click(screen.getByRole("button", { name: "Reintentar sincronización" }));
        expect(value.retryFusionReconciliation).toHaveBeenCalledOnce();
    });
});

describe("Fusion result dialog", () => {
    it("labels a successful mobile-safe dialog and focuses its close button", () => {
        renderFusion(context({
            fusionOperation: operation({
                status: "success",
                parentIds: [1, 2],
                result: MONSTERS[2],
                message: "¡Fusión exitosa!",
                noticeOpen: true
            })
        }));

        const dialog = screen.getByRole("dialog", { name: "¡Fusión exitosa!" });
        expect(dialog).toHaveClass("w-full", "max-w-90");
        expect(screen.getByRole("button", { name: "Volver" })).toHaveFocus();
    });

    it("closes with Escape and restores focus", async () => {
        const idleValue = context({ player: null, monsters: [] });
        const user = userEvent.setup();
        const { rerender } = renderFusion(idleValue);
        const homeLink = screen.getByRole("link", { name: "Volver al inicio" });
        homeLink.focus();

        const successValue = context({
            player: null,
            monsters: [],
            fusionOperation: operation({
                status: "success",
                result: MONSTERS[2],
                message: "¡Fusión exitosa!",
                noticeOpen: true
            })
        });
        usePlayer.mockReturnValue(successValue);
        rerender(<MemoryRouter><FusionPage /></MemoryRouter>);
        expect(screen.getByRole("button", { name: "Volver" })).toHaveFocus();

        await user.keyboard("{Escape}");
        expect(successValue.acknowledgeFusion).toHaveBeenCalledOnce();
        usePlayer.mockReturnValue(idleValue);
        rerender(<MemoryRouter><FusionPage /></MemoryRouter>);
        expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveFocus();
    });

    it("contains focus and retries unresolved reconciliation", async () => {
        const value = context({
            fusionOperation: operation({
                status: "uncertain",
                parentIds: [1, 2],
                message: "Resultado pendiente.",
                unresolved: true,
                noticeOpen: true
            })
        });
        const user = userEvent.setup();
        renderFusion(value);
        const retry = screen.getByRole("button", { name: "Reintentar sincronización" });
        const close = screen.getByRole("button", { name: "Volver" });

        expect(retry).toHaveFocus();
        await user.keyboard("{Shift>}{Tab}{/Shift}");
        expect(close).toHaveFocus();
        await user.keyboard("{Tab}");
        expect(retry).toHaveFocus();
        await user.click(retry);
        expect(value.retryFusionReconciliation).toHaveBeenCalledOnce();
    });

    it("renders confirmed failures without success content", () => {
        renderFusion(context({
            fusionOperation: operation({
                status: "confirmed-error",
                parentIds: [1, 2],
                message: "No recipe matches that fusion",
                noticeOpen: true
            })
        }));

        expect(screen.getByRole("dialog", { name: "Fusión no completada" })).toHaveTextContent(
            "No recipe matches that fusion"
        );
    });
});
