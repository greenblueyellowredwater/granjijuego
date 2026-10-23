import { existsSync, mkdirSync } from "node:fs";
import { elevatorLayout } from "../../src/render/elevator-layout.ts";
import puppeteer, { type KeyInput, type Page } from "puppeteer-core";

const BASE = process.env.E2E_URL ?? "http://localhost:5173";
const CHROME = process.env.CHROME_PATH ?? ["/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const OUT = process.env.E2E_OUT ?? "test/e2e/out";

const status = (page: Page) => page.$eval("#props", (el) => el.textContent ?? "");

async function waitStatus(page: Page, re: RegExp, timeout = 15000) {
  const end = Date.now() + timeout;
  let last = "";
  while (Date.now() < end) {
    last = await status(page);
    if (re.test(last)) return last;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timeout esperando ${re}: último estado:\n${last}`);
}

async function hold(page: Page, key: KeyInput, ms: number) {
  await page.keyboard.down(key);
  await new Promise((r) => setTimeout(r, ms));
  await page.keyboard.up(key);
}

async function holdUntil(page: Page, key: KeyInput, re: RegExp, timeout = 15000) {
  await page.keyboard.down(key);
  try {
    return await waitStatus(page, re, timeout);
  } finally {
    await page.keyboard.up(key);
  }
}

const settle = () => new Promise((r) => setTimeout(r, 400));

async function skipEvent(page: Page) {
  const ev = () => page.evaluate(`(() => { const w = window.__game?.scene.getScene("World"); if (!w || !w.body) return "warping"; return w.event ? (w.event.skippable ? "skip" : "wait") : (w.warping ? "warping" : "none"); })()`);
  for (let i = 0; i < 100; i++) {
    const s = await ev();
    if (s === "none") return;
    if (s === "skip") await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 100));
  }
}

const checks: [string, (page: Page) => Promise<void>][] = [
  [
    "entra a la tienda de Pierre por la puerta y sale por el felpudo",
    async (page) => {
      await page.goto(`${BASE}/?map=Town&x=43&y=57`);
      await waitStatus(page, /Town .* tile 43,57/);
      await holdUntil(page, "w", /Enfrente: LockedDoorWarp 6 29 SeedShop/);
      await page.keyboard.press("x");
      await waitStatus(page, /SeedShop .* tile 6,29/);
      await settle();
      await page.screenshot({ path: `${OUT}/seedshop.png` });
      await holdUntil(page, "s", /Town .* tile 43,57/);
    },
  ],
  [
    "sale del pueblo por el borde oeste hacia BusStop",
    async (page) => {
      await page.goto(`${BASE}/?map=Town&x=1&y=54`);
      await waitStatus(page, /Town .* tile 1,54/);
      await holdUntil(page, "a", /BusStop .* tile 42,23/);
      const selected = await page.$eval("#map", (el) => (el as HTMLSelectElement).value);
      if (selected !== "BusStop") throw new Error(`El selector quedó en ${selected}`);
      if (!page.url().includes("map=BusStop")) throw new Error(`La URL no siguió al jugador: ${page.url()}`);
      await settle();
      await page.screenshot({ path: `${OUT}/busstop.png` });
    },
  ],
  [
    "centra los mapas más chicos que la pantalla",
    async (page) => {
      await page.goto(`${BASE}/?map=FarmHouse&x=5&y=8`);
      await waitStatus(page, /FarmHouse .* tile 5,8/);
      await settle();
      await page.screenshot({ path: `${OUT}/farmhouse.png` });
      const scroll = await page.evaluate(() => {
        const cam = (window as any).__game?.scene.getScene("World")?.cameras.main;
        return cam ? { x: cam.scrollX, y: cam.scrollY, w: cam.width, h: cam.height } : null;
      });
      if (!scroll) throw new Error("No pude leer la cámara");
      const expected = { x: Math.floor((768 - scroll.w) / 2), y: Math.floor((768 - scroll.h) / 2) };
      if (scroll.x !== expected.x || scroll.y !== expected.y) throw new Error(`Cámara ${JSON.stringify(scroll)} esperaba ${JSON.stringify(expected)}`);
    },
  ],
  [
    "conserva el mundo generado al recargar y lo cambia con Nueva partida",
    async (page) => {
      const readState = () => page.evaluate(() => JSON.parse(localStorage.getItem("stardew-ts/partida") ?? "null"));
      await page.goto(`${BASE}/?map=Town&x=43&y=57`);
      await waitStatus(page, /Town .* tile/);
      const first = await readState();
      if (!first?.locations?.Town?.entities?.length) throw new Error("No se guardó lo generado en Town");
      await page.reload();
      await waitStatus(page, /Town .* tile/);
      const second = await readState();
      if (JSON.stringify(second.locations.Town) !== JSON.stringify(first.locations.Town) || second.uniqueId !== first.uniqueId) throw new Error("Al recargar cambió el mundo");
      page.once("dialog", (d) => d.accept());
      await Promise.all([page.waitForNavigation(), page.click("#new-game")]);
      await waitStatus(page, /Town .* tile/);
      const third = await readState();
      if (third.uniqueId === first.uniqueId) throw new Error("Nueva partida no cambió el ID de partida");
    },
  ],
  [
    "duerme en la cama y despierta al día siguiente",
    async (page) => {
      await page.goto(`${BASE}/?map=FarmHouse&x=5&y=9&time=2200`);
      await waitStatus(page, /FarmHouse .* tile 5,9/);
      const before = await page.evaluate(() => JSON.parse(localStorage.getItem("stardew-ts/partida") ?? "null"));
      await holdUntil(page, "d", /Pregunta abierta/);
      await settle();
      await page.screenshot({ path: `${OUT}/sleep-question.png` });
      await page.keyboard.press("Enter");
      await waitStatus(page, /FarmHouse .* tile 9,9[\s\S]*6:00 am/);
      const after = await page.evaluate(() => JSON.parse(localStorage.getItem("stardew-ts/partida") ?? "null"));
      if (after.daysPlayed !== before.daysPlayed + 1) throw new Error(`daysPlayed ${before.daysPlayed} → ${after.daysPlayed}`);
      await settle();
      await page.screenshot({ path: `${OUT}/wake-up.png` });
    },
  ],
  [
    "compra semillas en la tienda de Pierre",
    async (page) => {
      const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
      await page.goto(`${BASE}/?map=SeedShop&x=4&y=19&time=900`);
      await page.evaluate(`localStorage.clear()`);
      await page.goto(`${BASE}/?map=SeedShop&x=4&y=19&time=900`);
      await waitStatus(page, /SeedShop .* tile 4,19/);
      await new Promise((r) => setTimeout(r, 1500));
      await world(`(w.body.facing = 0, 1)`);
      await page.keyboard.press("x");
      for (let i = 0; i < 50 && !(await world(`w.shop.open`)); i++) await new Promise((r) => setTimeout(r, 100));
      if (!(await world(`w.shop.open`))) throw new Error("No abrió la tienda");
      await page.mouse.click(600, 130);
      await new Promise((r) => setTimeout(r, 300));
      const result = (await world(`JSON.stringify({ money: w.params.state.money, has: w.params.state.inventory.some(function (i) { return i && i.id === "(O)472"; }) })`)) as string;
      if (result !== '{"money":480,"has":true}') throw new Error(`Compra inesperada: ${result}`);
      await page.keyboard.press("Escape");
      await new Promise((r) => setTimeout(r, 300));
      if (await world(`w.shop.open`)) throw new Error("No cerró la tienda");
      await world(`(w.params.state.inventory[6] = { id: "(O)24", stack: 2, quality: 0 }, w.selectSlot(6), w.params.npcs.npcs.forEach(function (n) { if (n.name === "Pierre") { n.x = 4 * 64; n.y = 18 * 64; n.schedule = []; } }), w.body.facing = 0, 1)`);
      await page.keyboard.press("x");
      await new Promise((r) => setTimeout(r, 300));
      const gift = (await world(`JSON.stringify({ f: w.params.state.friendship.Pierre, open: w.dialogueBox.open, portrait: !w.dialogueBox.portraitless, left: w.params.state.inventory[6].stack })`)) as string;
      const g = JSON.parse(gift);
      if (g.f?.points !== 45 || g.f.giftsToday !== 1 || !g.open || !g.portrait || g.left !== 1) throw new Error(`Regalo inesperado: ${gift}`);
      await page.screenshot({ path: `${OUT}/gift.png` });
      for (let i = 0; i < 30 && (await world(`w.dialogueBox.open`)); i++) {
        await page.keyboard.press("x");
        await new Promise((r) => setTimeout(r, 150));
      }
      await new Promise((r) => setTimeout(r, 300));
      for (let i = 0; i < 5 && !(await world(`w.dialogueBox.open && w.dialogueBox.portraitless`)); i++) {
        await page.keyboard.press("x");
        await new Promise((r) => setTimeout(r, 300));
      }
      const again = (await world(`JSON.stringify({ text: w.dialogueBox.open && w.dialogueBox.portraitless ? w.dialogueBox.pages[0].text : null, left: w.params.state.inventory[6].stack })`)) as string;
      if (again !== '{"text":"You\'ve already given Pierre a gift today.","left":1}') throw new Error(`Segundo regalo: ${again}`);
    },
  ],
  [
    "abre el inventario, mueve y tira ítems",
    async (page) => {
      const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
      await page.goto(`${BASE}/?map=FarmHouse&x=3&y=9&time=900`);
      await page.evaluate(`localStorage.clear()`);
      await page.goto(`${BASE}/?map=FarmHouse&x=3&y=9&time=900`);
      await waitStatus(page, /FarmHouse .* tile 3,9/);
      await world(`(w.params.state.inventory[6] = { id: "(O)24", stack: 5, quality: 0 }, 1)`);
      await page.keyboard.press("e");
      await new Promise((r) => setTimeout(r, 300));
      if (!(await world(`w.gameMenu.open`))) throw new Error("No abrió el menú");
      const t0 = await world(`w.params.clock.time`);
      await page.mouse.click(672, 212);
      await page.mouse.click(352, 212);
      await page.mouse.click(672, 212);
      const ids = (await world(`JSON.stringify([w.params.state.inventory[1].id, w.params.state.inventory[6].id, w.gameMenu.held])`)) as string;
      if (ids !== '["(O)24","(T)Hoe",null]') throw new Error(`Intercambio inesperado: ${ids}`);
      await page.screenshot({ path: `${OUT}/inventory.png` });
      await page.mouse.click(672, 212);
      await page.mouse.click(1133, 504);
      if (await world(`w.params.state.inventory[6] !== null`)) throw new Error("No levantó el ítem");
      if (await world(`w.gameMenu.held !== null`)) throw new Error("No tiró el ítem");
      await page.keyboard.press("Escape");
      await new Promise((r) => setTimeout(r, 300));
      if (await world(`w.gameMenu.open`)) throw new Error("No cerró el menú");
      if ((await world(`w.params.clock.time`)) !== t0) throw new Error("El reloj avanzó con el menú abierto");
    },
  ],
  [
    "muestra la subida de nivel al dormir y elige profesión",
    async (page) => {
      const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
      await page.goto(`${BASE}/?map=FarmHouse&x=3&y=9&time=900`);
      await page.evaluate(`localStorage.clear()`);
      await page.goto(`${BASE}/?map=FarmHouse&x=3&y=9&time=900`);
      await waitStatus(page, /FarmHouse .* tile 3,9/);
      await world(`(w.params.state.newLevels = [[0, 1], [2, 5]], w.endDay(), 1)`);
      for (let i = 0; i < 150 && !(await world(`!!(w.levelUp && w.levelUp.current)`)); i++) await new Promise((r) => setTimeout(r, 100));
      if ((await world(`w.levelUp.current.title`)) !== "Level 1 Farming") throw new Error("No apareció el nivel 1 de cultivo");
      await page.screenshot({ path: `${OUT}/level-up.png` });
      await page.keyboard.press("x");
      await new Promise((r) => setTimeout(r, 300));
      if (!(await world(`!!w.levelUp.current.professions`))) throw new Error("No apareció la elección de profesión");
      await page.mouse.click(400, 450);
      for (let i = 0; i < 150; i++) {
        if (await world(`w.sys.isActive() && !w.endingDay && w.params.state.dayOfMonth === 2`)) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const r = (await world(`JSON.stringify({ p: w.params.state.professions, nl: w.params.state.newLevels.length, sc: w.params.state.craftingRecipes.indexOf("Scarecrow") >= 0, day: w.params.state.dayOfMonth })`)) as string;
      if (r !== '{"p":[12],"nl":0,"sc":true,"day":2}') throw new Error(`Estado tras la noche: ${r}`);
    },
  ],
  [
    "coloca un cofre, guarda ítems y lo recuerda",
    async (page) => {
      const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
      await page.goto(`${BASE}/?map=FarmHouse&x=5&y=9&time=900`);
      await page.evaluate(`localStorage.clear()`);
      await page.goto(`${BASE}/?map=FarmHouse&x=5&y=9&time=900`);
      await waitStatus(page, /FarmHouse .* tile 5,9/);
      await world(`(w.params.state.inventory[6] = { id: "(BC)130", stack: 1, quality: 0 }, w.params.state.inventory[7] = { id: "(O)24", stack: 7, quality: 0 }, w.selectSlot(6), w.body.facing = 3, 1)`);
      await page.keyboard.press("c");
      await new Promise((r) => setTimeout(r, 300));
      await page.keyboard.press("x");
      await new Promise((r) => setTimeout(r, 300));
      if (!(await world(`w.chestMenu.open`))) throw new Error("No abrió el cofre");
      await page.mouse.click(236 + 7 * 64 + 32, 436 - 4 + 32);
      await new Promise((r) => setTimeout(r, 200));
      await page.screenshot({ path: `${OUT}/chest.png` });
      await page.keyboard.press("Escape");
      await new Promise((r) => setTimeout(r, 200));
      await page.reload();
      await waitStatus(page, /FarmHouse .* tile/);
      const saved = (await world(`JSON.stringify(w.entities.filter(function (e) { return e.kind === "bigCraftable"; }).map(function (e) { return [e.x, e.y, (e.items || []).filter(Boolean)]; }))`)) as string;
      if (saved !== '[[4,9,[{"id":"(O)24","stack":7,"quality":0}]]]') throw new Error(`Cofre guardado: ${saved}`);
    },
  ],
  [
    "carga un horno y un barril y recoge barra y vino",
    async (page) => {
      const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
      await page.goto(`${BASE}/?map=FarmHouse&x=5&y=9&time=900`);
      await page.evaluate(`localStorage.clear()`);
      await page.goto(`${BASE}/?map=FarmHouse&x=5&y=9&time=900`);
      await waitStatus(page, /FarmHouse .* tile 5,9/);
      await world(`(w.params.state.inventory[6] = { id: "(BC)13", stack: 1, quality: 0 }, w.params.state.inventory[7] = { id: "(O)378", stack: 5, quality: 0 }, w.params.state.inventory[8] = { id: "(O)382", stack: 1, quality: 0 }, w.params.state.inventory[9] = { id: "(BC)12", stack: 1, quality: 0 }, w.params.state.inventory[10] = { id: "(O)258", stack: 1, quality: 0 }, 1)`);
      const step = async (slot: number, facing: number, key: KeyInput) => {
        await world(`(w.selectSlot(${slot}), w.body.facing = ${facing}, 1)`);
        await page.keyboard.press(key);
        await new Promise((r) => setTimeout(r, 250));
      };
      await step(6, 3, "c");
      await step(9, 1, "c");
      await step(7, 3, "x");
      await step(10, 1, "x");
      await world(`(w.tickMachines(20000), 1)`);
      await new Promise((r) => setTimeout(r, 300));
      await page.screenshot({ path: `${OUT}/machines.png` });
      await step(0, 3, "x");
      await step(0, 1, "x");
      const got = (await world(`JSON.stringify(w.params.state.inventory.filter(Boolean).map(function (i) { return i.id + (i.price ? "@" + i.price : ""); }))`)) as string;
      if (!got.includes('"(O)334"') || !got.includes('"(O)348@150"')) throw new Error(`Salida de máquinas: ${got}`);
    },
  ],
  [
    "habla con Clint en el mostrador y abre su tienda",
    async (page) => {
      const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
      await page.goto(`${BASE}/?map=Blacksmith&x=3&y=15&time=1000`);
      await page.evaluate(`localStorage.clear()`);
      await page.goto(`${BASE}/?map=Blacksmith&x=3&y=15&time=1000`);
      await waitStatus(page, /Blacksmith .* tile 3,15/);
      await new Promise((r) => setTimeout(r, 800));
      await world(`(w.params.npcs.npcs.forEach(function (n) { if (n.name === "Clint") { n.location = "Blacksmith"; n.x = 3 * 64; n.y = 13 * 64; n.schedule = []; } }), w.body.facing = 0, 1)`);
      await page.keyboard.press("x");
      await new Promise((r) => setTimeout(r, 400));
      if (!(await world(`w.question.open`))) throw new Error("Clint no ofreció el menú");
      await page.keyboard.press("Enter");
      await new Promise((r) => setTimeout(r, 400));
      const stock = (await world(`JSON.stringify(w.shop.open && w.shop.stock.map(function (e) { return e.id + "$" + e.price; }))`)) as string;
      if (stock !== '["(O)378$75","(O)380$150","(O)382$150","(O)384$400"]') throw new Error(`Stock de Clint: ${stock}`);
      await page.screenshot({ path: `${OUT}/clint-shop.png` });
      await page.keyboard.press("Escape");
      await new Promise((r) => setTimeout(r, 300));
      await world(`(w.params.state.money = 3000, w.params.state.inventory[6] = { id: "(O)334", stack: 6, quality: 0 }, w.openShop("ClintUpgrade"), 1)`);
      await page.mouse.click(600, 130);
      await new Promise((r) => setTimeout(r, 300));
      const up = (await world(`JSON.stringify({ up: w.params.state.toolUpgrade, money: w.params.state.money, bars: w.params.state.inventory[6].stack, axe: w.params.state.inventory.some(function (i) { return i && i.id === "(T)Axe"; }) })`)) as string;
      if (up !== '{"up":{"id":"(T)CopperAxe","daysLeft":2},"money":1000,"bars":1,"axe":false}') throw new Error(`Mejora: ${up}`);
    },
  ],
  [
    "pesca la primera vez un pez de tutorial con la barra",
    async (page) => {
      const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
      await page.goto(`${BASE}/?map=Town&x=77&y=85&time=1000`);
      await page.evaluate(`localStorage.clear()`);
      await page.goto(`${BASE}/?map=Town&x=77&y=85&time=1000`);
      await waitStatus(page, /Town .* tile 77,85/);
      await new Promise((r) => setTimeout(r, 800));
      await world(`(w.params.state.inventory[6] = { id: "(T)TrainingRod", stack: 1 }, w.selectSlot(6), w.body.facing = 2, 1)`);
      await page.keyboard.down("c");
      await new Promise((r) => setTimeout(r, 600));
      await page.keyboard.up("c");
      await new Promise((r) => setTimeout(r, 300));
      if ((await world(`w.fishing && w.fishing.phase`)) !== "waiting") throw new Error("El lance no cayó al agua");
      await world(`(w.fishing.biteIn = 50, 1)`);
      await new Promise((r) => setTimeout(r, 300));
      await page.keyboard.press("c");
      await new Promise((r) => setTimeout(r, 1000));
      if (!(await world(`!!(w.fishing && w.fishing.bar)`))) throw new Error("No empezó el minijuego");
      await page.screenshot({ path: `${OUT}/fishing-bar.png` });
      for (let i = 0; i < 60 && (await world(`!!(w.fishing && w.fishing.bar)`)); i++) {
        await world(`(w.fishing.bar.bobberPosition = w.fishing.bar.bobberBarPos + w.fishing.bar.bobberBarHeight / 2 - 10, 1)`);
        await new Promise((r) => setTimeout(r, 150));
      }
      const got = (await world(`JSON.stringify({ fish: w.params.state.inventory.some(function (i) { return i && i.id === "(O)145"; }), xp: w.params.state.experience[1] > 0 })`)) as string;
      if (got !== '{"fish":true,"xp":true}') throw new Error(`Resultado de pesca: ${got}`);
    },
  ],
  [
    "abre el regalo, siembra, riega y cosecha una chirivía a los 4 días",
    async (page) => {
      const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
      await page.goto(`${BASE}/?map=FarmHouse&x=3&y=9&time=700`);
      await page.evaluate(`localStorage.clear()`);
      await page.goto(`${BASE}/?map=FarmHouse&x=3&y=9&time=700`);
      await waitStatus(page, /FarmHouse .* tile 3,9/);
      await holdUntil(page, "w", /tile 3,8/);
      await page.keyboard.press("x");
      await waitStatus(page, /FarmHouse .* tile/);
      await new Promise((r) => setTimeout(r, 1500));
      const seeds = await world(`(w.params.state.inventory[5] || {}).id`);
      if (seeds !== "(O)472") throw new Error(`El regalo no dio semillas: ${seeds}`);
      await world(`(w.warpTo("Farm", 24, 10), 1)`);
      await waitStatus(page, /Farm .* tile 24,10/);
      await new Promise((r) => setTimeout(r, 800));
      await world(`(w.body.facing = 0, 1)`);
      for (const k of ["2", "6", "3"] as const) {
        await page.keyboard.press(k);
        await page.keyboard.press("c");
        await new Promise((r) => setTimeout(r, 1200));
      }
      const dirt = (await world(`JSON.stringify(w.dirtAt(24, 9))`)) as string;
      if (!dirt || !dirt.includes('"seed":"472"') || !dirt.includes('"watered":true')) throw new Error(`No quedó sembrado y regado: ${dirt}`);
      const settled = async (day: number) => {
        for (let i = 0; i < 150; i++) {
          if (await world(`w.sys.isActive() && !w.endingDay && w.body !== undefined && w.params.state.dayOfMonth === ${day}`)) return;
          await new Promise((r) => setTimeout(r, 100));
        }
        throw new Error(`No llegó al día ${day}`);
      };
      for (let d = 0; d < 4; d++) {
        await settled(d + 1);
        await new Promise((r) => setTimeout(r, 500));
        await world(`(w.params.state.locations.Farm.entities.forEach(function (e) { if (e.kind === "hoeDirt") e.watered = true; }), w.endDay(), 1)`);
      }
      await settled(5);
      await world(`(w.warpTo("Farm", 24, 10), 1)`);
      await waitStatus(page, /Farm .* tile 24,10/);
      await new Promise((r) => setTimeout(r, 800));
      await world(`(w.body.facing = 0, 1)`);
      await page.keyboard.press("x");
      await new Promise((r) => setTimeout(r, 500));
      const inv = (await world(`JSON.stringify(w.params.state.inventory)`)) as string;
      if (!inv.includes('"(O)24"')) throw new Error(`No se cosechó: ${inv}`);
      await page.screenshot({ path: `${OUT}/harvest.png` });
    },
  ],
  [
    "no atraviesa paredes",
    async (page) => {
      await page.goto(`${BASE}/?map=SeedShop&x=6&y=27`);
      await waitStatus(page, /SeedShop .* tile 6,27/);
      await hold(page, "a", 3000);
      const s = await status(page);
      const x = +/tile (-?\d+),/.exec(s)![1];
      if (x < 2) throw new Error(`Atravesó la pared: ${s}`);
    },
  ],
  [
    "baja a las minas, rompe la última piedra, desciende por la escalera y sale",
    async (page) => {
      const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
      await page.goto(`${BASE}/?map=Mine&x=23&y=10`);
      await skipEvent(page);
      await waitStatus(page, /Mine .* tile 23,10/);
      await holdUntil(page, "w", /Enfrente: Mine/);
      await page.keyboard.press("x");
      await waitStatus(page, /UndergroundMine1 \(Maps\/Mines\/1\)/);
      await settle();
      await page.screenshot({ path: `${OUT}/mine1.png` });
      const stone = (await world(`(() => { const s = w.entities.find((e) => e.kind === "object" && e.hp !== undefined && w.location.tile("Back", e.x, e.y - 1) && !w.location.tile("Buildings", e.x, e.y - 1) && !w.entities.some((o) => o.x === e.x && o.y === e.y - 1)); w.mine.stonesLeft = 1; w.mine.ladderHasSpawned = false; s.hp = 1; w.body.x = s.x * 64; w.body.y = (s.y - 1) * 64 + 16; w.body.facing = 2; return { x: s.x, y: s.y }; })()`)) as { x: number; y: number };
      await page.keyboard.press("4");
      for (let i = 0; i < 6 && (await world(`w.entities.some((e) => e.x === ${stone.x} && e.y === ${stone.y})`)); i++) {
        await page.keyboard.press("c");
        await new Promise((r) => setTimeout(r, 700));
      }
      if (!(await world(`w.mine.ladderHasSpawned && w.location.tileIndexOnSheet("Buildings", ${stone.x}, ${stone.y}, "mine") === 173`))) throw new Error("No apareció la escalera");
      await settle();
      await page.screenshot({ path: `${OUT}/mine-ladder.png` });
      await page.keyboard.press("x");
      await waitStatus(page, /UndergroundMine2 /);
      await settle();
      await hold(page, "w", 150);
      await page.keyboard.press("x");
      await waitStatus(page, /Pregunta abierta/);
      await page.keyboard.press("Enter");
      await waitStatus(page, /^Mine .* tile 23,8/m);
    },
  ],
  [
    "Marlon da la espada oxidada al saltar el evento, mata un slime y un slime le hace daño",
    async (page) => {
      const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
      await page.goto(`${BASE}/?map=Mine&x=23&y=10`);
      await skipEvent(page);
      await waitStatus(page, /Mine .* tile 23,10/);
      const slot = (await world(`w.params.state.inventory.findIndex((i) => i && i.id === "(W)0")`)) as number;
      if (slot < 0) throw new Error("No recibió la espada oxidada");
      await world(`w.warpTo("UndergroundMine2", -1, -1)`);
      await waitStatus(page, /UndergroundMine2 /);
      await settle();
      await world(`(() => { w.monsters = []; const s = w.mine.start; w.body.facing = 2; const m = w.createMonster({ name: "Green Slime", x: s.x, y: s.y + 1 }, 2); m.walkingToward = false; m.jitter = 0; m.speed = 0; m.health = 3; w.monsters.push(m); return true; })()`);
      await page.keyboard.press(String(slot + 1) as KeyInput);
      for (let i = 0; i < 10 && ((await world(`w.monsters.length`)) as number) > 0; i++) {
        await page.keyboard.press("c");
        await new Promise((r) => setTimeout(r, 400));
      }
      if (((await world(`w.monsters.length`)) as number) > 0) throw new Error("El slime sigue vivo");
      const xp = (await world(`w.params.state.experience[4]`)) as number;
      if (xp <= 0) throw new Error(`Sin experiencia de combate: ${xp}`);
      await world(`(() => { const s = w.mine.start; const m = w.createMonster({ name: "Green Slime", x: s.x, y: s.y + 1 }, 2); w.monsters.push(m); m.vy = 10; return true; })()`);
      let hp = 100;
      for (let i = 0; i < 40 && hp >= 100; i++) {
        await new Promise((r) => setTimeout(r, 100));
        hp = (await world(`w.params.state.health`)) as number;
      }
      if (hp >= 100) throw new Error(`El slime no hizo daño: ${hp}`);
      await page.screenshot({ path: `${OUT}/combat.png` });
    },
  ],
  [
    "usa el ascensor de la mina para bajar al nivel 40",
    async (page) => {
      const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
      await page.goto(`${BASE}/?map=Mine&x=17&y=4`);
      await skipEvent(page);
      await waitStatus(page, /Mine .* tile 17,4/);
      await world(`(w.params.state.deepestMineLevel = 45, true)`);
      await holdUntil(page, "w", /Enfrente: MineElevator/);
      await page.keyboard.press("x");
      await settle();
      await page.screenshot({ path: `${OUT}/elevator.png` });
      const size = (await world(`({ w: w.cameras.main.width, h: w.cameras.main.height })`)) as { w: number; h: number };
      const btn = elevatorLayout(45, size.w, size.h).buttons.find((b) => b.level === 40)!;
      await page.mouse.click(btn.x + 20, btn.y + 20);
      await waitStatus(page, /UndergroundMine40 /);
      const ok = await world(`(() => { const e = w.mine.elevator; const t = { x: Math.floor((w.body.x + 32) / 64), y: Math.floor((w.body.y + 16) / 64) }; return !!e && t.x === e.x && t.y === e.y; })()`);
      if (!ok) throw new Error("No apareció junto al ascensor");
    },
  ],
  [
    "al entrar a la mina por primera vez Marlon camina, habla y entrega la espada",
    async (page) => {
      const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
      await page.goto(`${BASE}/?map=Mine&x=23&y=10`);
      await page.evaluate(`localStorage.clear()`);
      await page.goto(`${BASE}/?map=Mine&x=23&y=10`);
      const end = Date.now() + 60000;
      let spoke = false;
      while (Date.now() < end) {
        const st = (await world(`JSON.stringify({ ev: !!w.event, dlg: !!(w.dialogueBox && w.dialogueBox.open), sp: w.dialogueBox ? w.dialogueBox.speaker : "" })`).catch(() => "{}")) as string;
        const s = JSON.parse(st);
        if (s.dlg && s.sp === "Marlon") {
          if (!spoke) await page.screenshot({ path: `${OUT}/marlon.png` });
          spoke = true;
          await page.keyboard.press("x");
        }
        if (spoke && s.ev === false) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!spoke) throw new Error("Marlon no habló");
      const inv = (await world(`JSON.stringify(w.params.state.inventory)`)) as string;
      if (!inv.includes('"(W)0"')) throw new Error(`Sin espada: ${inv}`);
      if (!((await world(`w.params.state.eventsSeen.includes("100162")`)) as boolean)) throw new Error("Evento no marcado");
    },
  ],
];

if (!CHROME) throw new Error("No encontré Chrome; definí CHROME_PATH");
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800"],
  defaultViewport: { width: 1280, height: 800 },
});
let failed = 0;
for (const [name, run] of checks.filter(([n]) => !process.env.ONLY || n.includes(process.env.ONLY))) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error(`  [pageerror] ${e}`));
  try {
    await run(page);
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n  ${(e as Error).message.replace(/\n/g, "\n  ")}`);
    await page.screenshot({ path: `${OUT}/fail-${failed}.png` }).catch(() => {});
  }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
