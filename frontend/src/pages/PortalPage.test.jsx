import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PortalPage from "./PortalPage.jsx";

describe("PortalPage", () => {
    it("presents expeditions as unavailable, non-interactive content", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        render(<PortalPage />);

        expect(screen.getAllByText("Próximamente")).toHaveLength(4);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(screen.queryByRole("img")).not.toBeInTheDocument();
        expect(screen.queryByText(/Consigue monstruos/)).not.toBeInTheDocument();
        expect(consoleSpy).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});
