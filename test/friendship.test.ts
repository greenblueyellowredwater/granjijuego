import { describe, expect, it } from "vitest";
import { canBeGivenAsGift, canReceiveGiftNow, changeFriendship, giftFriendshipChange, giftReaction, giftTaste, GiftTaste, objectContextTags, recordGift, resetFriendshipsForNewDay, totalDays, totalSundayWeeks, type Friendship, type GiftObjectData } from "../src/world/friendship.ts";

const objects: Record<string, GiftObjectData> = {
  "24": { Name: "Parsnip", Type: "Basic", Category: -75, Price: 35, Edibility: 10, ContextTags: ["color_yellow"] },
  "66": { Name: "Amethyst", Type: "Minerals", Category: -2, Price: 100, Edibility: -300 },
  "16": { Name: "Wild Horseradish", Type: "Basic", Category: -81, Price: 50, Edibility: 5 },
  "330": { Name: "Clay", Type: "Basic", Category: -16, Price: 20, Edibility: -300 },
  "168": { Name: "Trash", Type: "Basic", Category: -20, Price: 0, Edibility: -300 },
  "92": { Name: "Sap", Type: "Basic", Category: -81, Price: 2, Edibility: -1 },
  "96": { Name: "Dwarf Scroll I", Type: "Arch", Category: 0, Price: 1, Edibility: -300 },
  "797": { Name: "Pearl", Type: "Basic", Category: 0, Price: 2500, Edibility: -300, CanBeGivenAsGift: false },
  "770": { Name: "Mixed Seeds", Type: "Seeds", Category: -74, Price: 0, Edibility: -300 },
};

const tastes: Record<string, string> = {
  Universal_Love: "74 446 797 373 279 127 110 111 112 444 445 347 336 337 226 305 439 680 413 437 454 446",
  Universal_Like: "-2 -7 -26 -75 -80 72 395",
  Universal_Neutral: "194 216 262 304 815",
  Universal_Dislike: "-5 -8 -9 -15 -16 -19 -20 -21 -22 -24 -74 -81 330",
  Universal_Hate: "-28 -27 -79 92 168",
  Abigail: "I seriously love this!/66 128 220/Hey, how'd you know I was hungry?/119 109/What am I supposed to do with this?/-5 -75 -79 16/What were you thinking? This is awful!/330/You brought me a present? Thanks.//",
  Penny: "Love!/ /Like!/ /Dislike!/ /Hate!/ /Neutral./ /",
};

describe("gustos de regalo", () => {
  it("lista personal antes que la universal", () => {
    expect(giftTaste("Abigail", "(O)66", objects, tastes)).toBe(GiftTaste.Love);
    expect(giftTaste("Abigail", "(O)330", objects, tastes)).toBe(GiftTaste.Hate);
    expect(giftTaste("Abigail", "(O)16", objects, tastes)).toBe(GiftTaste.Dislike);
  });

  it("categoría personal solo si no hubo ítem universal explícito", () => {
    expect(giftTaste("Abigail", "(O)24", objects, tastes)).toBe(GiftTaste.Dislike);
    expect(giftTaste("Penny", "(O)24", objects, tastes)).toBe(GiftTaste.Like);
    expect(giftTaste("Penny", "(O)168", objects, tastes)).toBe(GiftTaste.Hate);
  });

  it("neutral sin lista: comestible negativo es odio y precio bajo es disgusto", () => {
    expect(giftTaste("Penny", "(O)92", objects, tastes)).toBe(GiftTaste.Hate);
    expect(giftTaste("Penny", "(O)770", objects, tastes)).toBe(GiftTaste.Dislike);
  });

  it("artefactos: Penny los aprecia, el resto no", () => {
    expect(giftTaste("Penny", "(O)96", objects, tastes)).toBe(GiftTaste.Like);
    expect(giftTaste("Abigail", "(O)96", objects, tastes)).toBe(GiftTaste.Dislike);
  });

  it("té de fruta estelar siempre es 7", () => {
    expect(giftTaste("Abigail", "(O)StardropTea", objects, tastes)).toBe(GiftTaste.StardropTea);
  });

  it("etiquetas base y regalabilidad", () => {
    const tags = objectContextTags(objects, "(O)24");
    expect([...tags]).toEqual(expect.arrayContaining(["id_(o)24", "id_o_24", "color_yellow", "item_parsnip", "item_type_basic", "category_vegetable"]));
    expect(canBeGivenAsGift(objects, "(O)24")).toBe(true);
    expect(canBeGivenAsGift(objects, "(O)797")).toBe(false);
    expect(canBeGivenAsGift(objects, "(T)Axe")).toBe(false);
  });
});

describe("amistad", () => {
  it("puntos por gusto, calidad y cumpleaños", () => {
    expect(giftFriendshipChange(GiftTaste.Love, 0, false)).toBe(80);
    expect(giftFriendshipChange(GiftTaste.Love, 1, false)).toBe(88);
    expect(giftFriendshipChange(GiftTaste.Like, 2, false)).toBe(56);
    expect(giftFriendshipChange(GiftTaste.Like, 4, false)).toBe(67);
    expect(giftFriendshipChange(GiftTaste.Love, 3, false)).toBe(80);
    expect(giftFriendshipChange(GiftTaste.Neutral, 0, false)).toBe(20);
    expect(giftFriendshipChange(GiftTaste.Dislike, 0, false)).toBe(-20);
    expect(giftFriendshipChange(GiftTaste.Hate, 0, true)).toBe(-320);
    expect(giftFriendshipChange(GiftTaste.Love, 0, true)).toBe(640);
    expect(giftFriendshipChange(GiftTaste.StardropTea, 0, true)).toBe(750);
  });

  it("tope por corazones máximos", () => {
    const f: Friendship = { points: 2200, talkedToday: false };
    changeFriendship(f, 500, true);
    expect(f.points).toBe(2249);
    changeFriendship(f, 1000, false);
    expect(f.points).toBe(2749);
    changeFriendship(f, -5000, false);
    expect(f.points).toBe(0);
  });

  it("límite diario y semanal", () => {
    const f: Friendship = { points: 0, talkedToday: false };
    expect(canReceiveGiftNow(f, false, "(O)24")).toBeNull();
    recordGift(f, 10);
    expect(canReceiveGiftNow(f, false, "(O)24")).toEqual({ kind: "alreadyToday" });
    expect(canReceiveGiftNow(f, false, "(O)StardropTea")).toBeNull();
    f.giftsToday = 0;
    recordGift(f, 11);
    f.giftsToday = 0;
    expect(canReceiveGiftNow(f, false, "(O)24")).toEqual({ kind: "weekLimit" });
    expect(canReceiveGiftNow(f, true, "(O)24")).toBeNull();
  });

  it("fechas", () => {
    expect(totalDays(1, "spring", 1)).toBe(0);
    expect(totalDays(2, "fall", 13)).toBe(180);
    expect(totalSundayWeeks(5)).toBe(0);
    expect(totalSundayWeeks(6)).toBe(1);
  });

  it("nuevo día: decae sin charla, reinicia regalos y bonifica la semana completa", () => {
    const friendship: Record<string, Friendship> = {
      Abigail: { points: 100, talkedToday: false, giftsToday: 1, giftsThisWeek: 2, lastGiftDay: 5 },
      Pierre: { points: 2600, talkedToday: false },
      Lewis: { points: 100, talkedToday: true },
      Ghost: { points: 100, talkedToday: false },
    };
    const datable = (n: string) => (n === "Abigail" ? true : n === "Ghost" ? null : false);
    resetFriendshipsForNewDay(friendship, datable, 6);
    expect(friendship.Abigail).toMatchObject({ points: 108, giftsToday: 0, giftsThisWeek: 0 });
    expect(friendship.Pierre.points).toBe(2600);
    expect(friendship.Lewis).toMatchObject({ points: 100, talkedToday: false });
    expect(friendship.Ghost.points).toBe(100);
  });
});

describe("reacción al regalo", () => {
  const base = { name: "Abigail", qualifiedId: "(O)66", birthday: false, rude: true, tags: objectContextTags(objects, "(O)66"), tastes, strings: { "NPC.cs.4274": "You remembered my birthday?$h", "NPC.cs.4276": "Is it my birthday?$h/Is it my birthday?$h" }, nextBool: () => false };

  it("usa el texto del gusto en NPCGiftTastes con emoción", () => {
    expect(giftReaction({ ...base, taste: GiftTaste.Love, dialogue: {} })).toEqual({ text: "I seriously love this!", emotion: "$h" });
    expect(giftReaction({ ...base, taste: GiftTaste.Hate, dialogue: {} })).toEqual({ text: "What were you thinking? This is awful!", emotion: "$s" });
    expect(giftReaction({ ...base, taste: GiftTaste.Neutral, dialogue: {} })).toEqual({ text: "You brought me a present? Thanks.", emotion: null });
  });

  it("prefiere AcceptGift específicos del diálogo", () => {
    const dialogue = { "AcceptGift_(O)66": "Amatista!", AcceptGift_Loved: "Me encanta", AcceptGift: "Gracias" };
    expect(giftReaction({ ...base, taste: GiftTaste.Love, dialogue })?.text).toBe("Amatista!");
    expect(giftReaction({ ...base, qualifiedId: "(O)24", tags: objectContextTags(objects, "(O)24"), taste: GiftTaste.Love, dialogue })?.text).toBe("Me encanta");
    expect(giftReaction({ ...base, qualifiedId: "(O)24", tags: objectContextTags(objects, "(O)24"), taste: GiftTaste.Dislike, dialogue })?.text).toBe("Gracias");
  });

  it("cumpleaños usa las frases genéricas según modales", () => {
    expect(giftReaction({ ...base, birthday: true, taste: GiftTaste.Love, dialogue: {} })?.text).toBe("You remembered my birthday?$h");
    expect(giftReaction({ ...base, birthday: true, taste: GiftTaste.Like, dialogue: {}, nextBool: () => true })?.text).toBe("Is it my birthday?$h");
  });
});
