import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../context/PlayerContext.js", () => ({
    usePlayer: vi.fn()
}));

import { usePlayer } from "../../context/PlayerContext.js";
import { Navbar } from "./Navbar.jsx";

function Location() {
    return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderNavbar(value, path = "/portal") {
    usePlayer.mockReturnValue(value);
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Navbar />
            <Routes>
                <Route path="*" element={<Location />} />
            </Routes>
        </MemoryRouter>
    );
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("Navbar", () => {
    it.each([
        [{ playerLoading: true, playerError: null, player: null }, "Cargando..."],
        [{ playerLoading: false, playerError: "Offline", player: null }, "Jugador no disponible"],
        [{ playerLoading: false, playerError: null, player: null }, "Invitado"],
        [{ playerLoading: false, playerError: null, player: { username: "Ada" } }, "Ada"]
    ])("uses the identity status as a Home link", (value, label) => {
        renderNavbar(value);

        expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", "/");
    });

    it("supports keyboard navigation to Home", async () => {
        const user = userEvent.setup();
        renderNavbar({ playerLoading: false, playerError: null, player: null });

        await user.tab();
        expect(screen.getByRole("link", { name: "Invitado" })).toHaveFocus();
        await user.keyboard("{Enter}");
        expect(screen.getByTestId("location")).toHaveTextContent("/");
    });
});
