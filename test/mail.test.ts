import { describe, expect, it } from "vitest";
import { DotNetRandom } from "../src/world/dotnet-random.ts";
import { addMailForTomorrow, friendGiftLetter, parseLetter, receiveMailForTomorrow, runTriggers, seasonalLetter, type MailState, type TriggerAction } from "../src/world/mail.ts";
import { paginateLetter } from "../src/render/letter-menu.ts";
import { spriteTextPages } from "../src/render/spritetext.ts";

const ctx = { playerName: "Ana", male: false, random: () => 0, cookingRecipes: { "Fried Egg": "194 1/10 10/194/f Robin 2" }, craftingRecipes: { "Wood Fence": "388 2/Field/322/false/l 0" }, knownCooking: [] };
const fresh = (): MailState => ({ mailbox: [], mailForTomorrow: [], mailReceived: [] });

describe("correo: entrega", () => {
  it("el correo de mañana llega al buzón o directo a recibidos", () => {
    const m = fresh();
    addMailForTomorrow(m, "a");
    addMailForTomorrow(m, "b", true);
    addMailForTomorrow(m, "a");
    receiveMailForTomorrow(m);
    expect(m).toEqual({ mailbox: ["a"], mailForTomorrow: [], mailReceived: ["b"] });
  });

  it("cartas de estación con o sin año", () => {
    const mail = { spring_2_1: "x", fall_15: "y" };
    expect(seasonalLetter("spring", 2, 1, mail)).toBe("spring_2_1");
    expect(seasonalLetter("spring", 2, 2, mail)).toBeNull();
    expect(seasonalLetter("fall", 15, 3, mail)).toBe("fall_15");
  });

  it("cartas de regalo de amigos según corazones", () => {
    expect(friendGiftLetter({ Robin: { points: 1000 } }, { Robin: "..." }, () => 0.3, null)).toBe("Robin");
    expect(friendGiftLetter({ Robin: { points: 1000 } }, { Robin: "..." }, () => 0.5, null)).toBeNull();
    expect(friendGiftLetter({ Lewis: { points: 2500 } }, { Robin: "..." }, () => 0, null)).toBeNull();
  });

  it("acciones de disparo agregan correo una sola vez", () => {
    const actions: TriggerAction[] = [{ Id: "mom1", Trigger: "DayEnding", Condition: "PLAYER_MONEY_EARNED Current 5000, PLAYER_GENDER Current Female", Action: "AddMail Current mom1", Actions: null, MarkActionApplied: true }];
    const host = { mail: fresh(), applied: [] as string[], markEventSeen: () => {} };
    const state = { season: "spring" as const, dayOfMonth: 1, year: 1, daysPlayed: 1, uniqueId: 1, greenRainDays: [] };
    const player = { mailReceived: [], mailbox: [], mailForTomorrow: [], eventsSeen: [], friendship: {}, male: false, totalEarned: 6000, conversationTopics: [], weather: "Sun" };
    runTriggers("DayEnding", actions, { state, random: new DotNetRandom(1), player }, host);
    runTriggers("DayEnding", actions, { state, random: new DotNetRandom(1), player }, host);
    expect(host.mail.mailForTomorrow).toEqual(["mom1"]);
    expect(host.applied).toEqual(["mom1"]);
  });
});

describe("correo: cartas", () => {
  it("interpreta nombre, ítems, dinero y título", () => {
    const l = parseLetter("Hola @!^ -Robin %item id (O)388 50 %%[#]Un regalo", "Robin", ctx);
    expect(l.text).toBe("Hola Ana!^ -Robin ");
    expect(l.items).toEqual([{ id: "(O)388", count: 50 }]);
    expect(l.title).toBe("Un regalo");
    expect(parseLetter("Toma %item money 250 300 %%", "x", { ...ctx, random: () => 0.5 }).money).toBe(270);
    expect(parseLetter("x %item object 388 5 390 7 %%", "x", { ...ctx, random: () => 0.6 }).items).toEqual([{ id: "(O)390", count: 7 }]);
  });

  it("recetas por carta y fondo según remitente", () => {
    expect(parseLetter("x %item cookingRecipe %%", "RobinCooking", ctx).recipe).toEqual({ kind: "cooking", name: "Fried Egg" });
    expect(parseLetter("x %item craftingRecipe Wood_Fence %%", "x", ctx).recipe).toEqual({ kind: "crafting", name: "Wood Fence" });
    expect(parseLetter("x", "wizardLetter", ctx).bg).toBe(2);
    expect(parseLetter("[letterbg 3]x", "x", ctx).bg).toBe(3);
  });

  it("parte el texto en páginas por altura", () => {
    const long = Array(80).fill("palabra").join(" ");
    const pages = spriteTextPages(long, 1216, 592);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join("")).toBe(long);
    expect(paginateLetter(parseLetter("corta", "x", ctx)).pages).toEqual(["corta"]);
  });
});
