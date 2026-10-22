import puppeteer from "puppeteer-core";
const out = process.argv[2];
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
await page.goto("http://localhost:5173/?map=Farm&x=60&y=20&time=900");
await wait(5000);
const spot = (await world(`(function () {
  for (const e of w.entities) if (e.kind === "tree" && e.stage >= 5 && !w.location.blocksFarmer(e.x - 1, e.y) && !w.occupied(e.x - 1, e.y)) return { x: e.x - 1, y: e.y };
  return null;
})()`)) as { x: number; y: number };
console.log("spot", JSON.stringify(spot));
await world(`(w.warpTo("Farm", ${spot.x}, ${spot.y}), 1)`);
await wait(4500);
await world(`(w.body.facing = 1, 1)`);
await page.keyboard.press("1");
for (let i = 0; i < 10; i++) { await page.keyboard.press("c"); await wait(700); }
await wait(300);
await page.screenshot({ path: `${out}/falling.png` });
await wait(2500);
await page.screenshot({ path: `${out}/fallen.png` });
console.log(await world(`JSON.stringify({ tree: w.entities.find(function (e) { return e.kind === "tree" && e.x === ${spot.x + 1} && e.y === ${spot.y}; }), drops: w.drops.length, inv: w.params.state.inventory.filter(Boolean).map(function (i) { return i.id + "x" + i.stack; }) })`));
for (let i = 0; i < 5; i++) { await page.keyboard.press("c"); await wait(700); }
await wait(2000);
console.log(await world(`JSON.stringify({ tree: w.entities.find(function (e) { return e.kind === "tree" && e.x === ${spot.x + 1} && e.y === ${spot.y}; }) || null, inv: w.params.state.inventory.filter(Boolean).map(function (i) { return i.id + "x" + i.stack; }) })`));
await browser.close();
