import { existsSync, mkdirSync } from "node:fs";
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

const checks: [string, (page: Page) => Promise<void>][] = [
  [
    "entra a la tienda de Pierre por la puerta y sale por el felpudo",
    async (page) => {
      await page.goto(`${BASE}/?map=Town&x=43&y=57`);
      await waitStatus(page, /Town .* tile 43,57/);
      await hold(page, "w", 120);
      await waitStatus(page, /Enfrente: LockedDoorWarp 6 29 SeedShop/);
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
for (const [name, run] of checks) {
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
