import { describe, expect, it } from "vitest";
import { createOutput, doAllTagsMatch, dyeColor, findRule, flavoredItem, minutesElapsed, minutesUntilMorning, readyMinutes, type MachineData } from "../src/world/machines.ts";

const objects = {
  "378": { SpriteIndex: 378, Name: "Copper Ore", Type: "Basic", Category: -15, Price: 5 },
  "258": { SpriteIndex: 258, Name: "Blueberry", Type: "Basic", Category: -79, Price: 50, Edibility: 10, ContextTags: ["color_blue"] },
  "24": { SpriteIndex: 24, Name: "Parsnip", Type: "Basic", Category: -75, Price: 35, Edibility: 10, ContextTags: ["color_yellow"] },
  "340": { SpriteIndex: 340, Name: "Honey", Type: "Basic", Category: -26, Price: 100 },
} as never;

const furnace: MachineData = {
  OutputRules: [{ Id: "Copper", Triggers: [{ Trigger: 1, RequiredItemId: "(O)378", RequiredCount: 5 }], OutputItem: [{ ItemId: "(O)334" }], MinutesUntilReady: 30 }],
  AdditionalConsumedItems: [{ ItemId: "(O)382", RequiredCount: 1 }],
  ShowNextIndexWhileWorking: true,
};
const keg: MachineData = {
  OutputRules: [
    { Id: "Juice", Triggers: [{ Trigger: 1, RequiredTags: ["category_vegetable"] }], OutputItem: [{ ItemId: "FLAVORED_ITEM Juice DROP_IN_ID" }], MinutesUntilReady: 6000 },
    { Id: "Wine", Triggers: [{ Trigger: 1, RequiredTags: ["category_fruits"] }], OutputItem: [{ ItemId: "FLAVORED_ITEM Wine DROP_IN_ID" }], MinutesUntilReady: 10000 },
  ],
};

describe("máquinas", () => {
  it("elige la regla por id, etiquetas y cantidad", () => {
    const ok = () => true;
    expect(findRule(furnace, { id: "(O)378", stack: 5 }, objects, ok).rule?.Id).toBe("Copper");
    expect(findRule(furnace, { id: "(O)378", stack: 3 }, objects, ok).countFail?.rule.Id).toBe("Copper");
    expect(findRule(keg, { id: "(O)258", stack: 1 }, objects, ok).rule?.Id).toBe("Wine");
    expect(findRule(keg, { id: "(O)24", stack: 1 }, objects, ok).rule?.Id).toBe("Juice");
    expect(doAllTagsMatch(["category_fruits", "!color_red"], new Set(["category_fruits", "color_blue"]))).toBe(true);
  });

  it("productos saborizados con precios del original", () => {
    expect(flavoredItem(0, { id: "(O)258", stack: 1 }, objects)).toEqual({ id: "(O)348", stack: 1, quality: 0, price: 150, preserve: { type: 0, id: "258" }, color: [46, 85, 183], edibility: 17 });
    expect(flavoredItem(3, { id: "(O)24", stack: 1 }, objects)).toMatchObject({ id: "(O)350", price: 78, edibility: 20, color: [255, 230, 0] });
    expect(flavoredItem(1, { id: "(O)258", stack: 1 }, objects)).toMatchObject({ id: "(O)344", price: 150 });
    expect(flavoredItem(2, { id: "(O)24", stack: 1 }, objects)).toMatchObject({ id: "(O)342", price: 120 });
    expect(dyeColor({ id: "(O)74", stack: 1 }, objects)).toEqual([255, 255, 255]);
    expect(createOutput({ ItemId: "(O)334" }, { id: "(O)378", stack: 5 }, objects)).toEqual({ id: "(O)334", stack: 1, quality: 0 });
  });

  it("tiempos", () => {
    expect(minutesUntilMorning(600)).toBe(1600);
    expect(minutesUntilMorning(2200, 2)).toBe(2240);
    expect(readyMinutes({ Id: "x", DaysUntilReady: 1 }, 1200)).toBe(1240);
    const s = { held: { id: "(O)334", stack: 1 }, minutesLeft: 30, ready: false };
    minutesElapsed(s, 20);
    expect(s).toMatchObject({ minutesLeft: 10, ready: false });
    minutesElapsed(s, 10);
    expect(s).toMatchObject({ minutesLeft: 0, ready: true });
  });
});
