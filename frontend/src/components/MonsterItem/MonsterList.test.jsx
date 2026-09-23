import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./MonsterItem.jsx", async () => {
    const { useState } = await import("react");

    return {
        default: function MockMonsterItem({ monster }) {
            const [mountedFor] = useState(monster.id);
            return <span data-testid={`monster-${monster.id}`}>{mountedFor}</span>;
        }
    };
});

import MonsterList from "./MonsterList.jsx";

describe("MonsterList", () => {
    it("preserves item identity when the collection order changes", () => {
        const monsters = [{ id: 1 }, { id: 2 }];
        const { rerender } = render(<MonsterList monsters={monsters} />);

        rerender(<MonsterList monsters={[...monsters].reverse()} />);

        expect(screen.getByTestId("monster-1")).toHaveTextContent("1");
        expect(screen.getByTestId("monster-2")).toHaveTextContent("2");
    });
});
