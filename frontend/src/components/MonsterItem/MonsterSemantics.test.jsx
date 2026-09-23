import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { getImage } from "../../imageHandler.js";
import MonsterItem from "./MonsterItem.jsx";
import { Stat } from "./Stat.jsx";
import TypeTag from "./TypeTag.jsx";

const MONSTER = {
    id: 1,
    name: "slime",
    display_name: "Slime",
    image_path: "monsters/slime.png",
    type: "slime",
    tier: 0,
    max_hp: 10,
    atk: 2,
    spd: 3,
    aim: 4
};

describe("shared monster rendering semantics", () => {
    it("resolves persisted aliases to existing artwork", () => {
        expect(getImage("monsters/pumpking.png")).toBe(getImage("monsters/pumpkin.png"));
        expect(getImage("monsters/phoenyx.png")).toBe(getImage("monsters/phoenix.png"));
        expect(getImage("monsters/pumpking.png")).toBeTruthy();
        expect(getImage("monsters/phoenyx.png")).toBeTruthy();
    });

    it("labels icon-only type tags and hides their decorative icon", () => {
        render(<TypeTag type="fur" showText={false} />);

        expect(screen.getByRole("img", { name: "Tipo: Peluda" })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Tipo: Peluda" }).querySelector("img")).toHaveAttribute("alt", "");
    });

    it("exposes stat text while hiding its visual bar and icon", () => {
        const { container } = render(
            <Stat stat="HP" value={10} max_value={180} img="icons/icon_hp.png" />
        );

        expect(screen.getByRole("group", { name: "HP: 10" })).toBeInTheDocument();
        expect(screen.queryByRole("img")).not.toBeInTheDocument();
        expect(container.querySelector("[aria-hidden='true']")).toBeInTheDocument();
    });

    it("uses the display name for the informative collection portrait", () => {
        render(<MemoryRouter><MonsterItem monster={MONSTER} /></MemoryRouter>);

        const images = screen.getAllByRole("img");
        expect(images).toHaveLength(1);
        expect(images[0]).toHaveAccessibleName("Slime");
    });
});
