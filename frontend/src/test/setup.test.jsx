import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("frontend test setup", () => {
    it("renders React components with DOM assertions", () => {
        render(<button type="button">Fuse</button>);

        expect(screen.getByRole("button", { name: "Fuse" })).toBeInTheDocument();
    });
});
