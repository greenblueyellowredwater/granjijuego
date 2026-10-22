import { describe, expect, it } from "vitest";
import { dialogueChunks, parseDialogue, retrieveDialogue } from "../src/world/dialogue.ts";
import { layoutSpriteText, widthOfString } from "../src/render/spritetext.ts";

describe("diálogos", () => {
  it("separa por #$e#, #$b# y aplica emociones, género y nombre", () => {
    const raw = "Hola Mr. @^Hola Ms. @$h#$b#Segunda$s#$e#Otro día";
    expect(dialogueChunks(raw)).toEqual(["Hola Mr. @^Hola Ms. @$h#$b#Segunda$s", "Otro día"]);
    expect(parseDialogue(dialogueChunks(raw)[0], "Ana", false)).toEqual([
      { text: "Hola Ms. Ana", portrait: 1 },
      { text: "Segunda", portrait: 2 },
    ]);
  });

  it("busca claves por día, año, corazones y día de semana", () => {
    const d = { Mon: "lunes", Mon_2: "lunes año 2", Mon4: "lunes 4 corazones", spring_5: "x", "5_2": "día 5 año 2" };
    expect(retrieveDialogue(d, "", 0, 1, 1)).toBe("lunes");
    expect(retrieveDialogue(d, "", 0, 3, 1)).toBe("lunes año 2");
    expect(retrieveDialogue(d, "", 5, 1, 1)).toBe("lunes 4 corazones");
    expect(retrieveDialogue(d, "", 0, 2, 5)).toBe("día 5 año 2");
    expect(retrieveDialogue(d, "spring_", 0, 1, 5)).toBe("x");
  });
});

describe("SpriteText", () => {
  it("avanza 8 px ×3 con ajustes por letra y corta en palabras", () => {
    expect(widthOfString("ab")).toBe(48);
    expect(widthOfString("a.")).toBe(42);
    const l = layoutSpriteText("aaa bbb", 4 * 24);
    expect(l.glyphs.map((g) => [g.x, g.y > 20 ? 1 : 0])).toEqual([[0, 0], [24, 0], [48, 0], [0, 1], [24, 1], [48, 1]]);
  });
});
