import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./context/PlayerContext.jsx", () => ({
    PlayerProvider: ({ children }) => children
}));
vi.mock("./components/Player/Navbar", () => ({
    Navbar: () => <nav>Navbar</nav>
}));
vi.mock("./pages/HomePage", () => ({ default: () => <p>Home route</p> }));
vi.mock("./pages/PortalPage", () => ({ default: () => <p>Portal route</p> }));
vi.mock("./pages/FusionPage", () => ({ default: () => <p>Fusion route</p> }));
vi.mock("./pages/MonsterDetailPage", () => ({ default: () => <p>Detail route</p> }));

import App from "./App.jsx";

beforeEach(() => {
    window.history.pushState({}, "", "/");
});

describe("application routes", () => {
    it.each([
        ["/", "Home route"],
        ["/portal", "Portal route"],
        ["/fusion", "Fusion route"],
        ["/monster/1", "Detail route"]
    ])("renders existing route %s", (path, expected) => {
        window.history.pushState({}, "", path);
        render(<App />);

        expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it("renders a recoverable client not-found state", () => {
        window.history.pushState({}, "", "/missing");
        render(<App />);

        expect(screen.getByRole("heading", { name: "Página no encontrada" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
    });
});
