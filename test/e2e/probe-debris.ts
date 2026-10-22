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
  for (const e of w.entities) {
    if (e.kind !== "object") continue;
    const d = w.params.items.objects[e.itemId];
    if (!d || d.Name !== "Stone") continue;
    if (!w.location.blocksFarmer(e.x - 1, e.y) && !w.occupied(e.x - 1, e.y)) return { x: e.x - 1, y: e.y, sx: e.x };
  }
  return null;
})()`)) as { x: number; y: number; sx: number };
console.log("spot", JSON.stringify(spot));
await world(`(w.warpTo("Farm", ${spot.x}, ${spot.y}), 1)`);
await wait(4500);
await world(`(w.body.facing = 1, 1)`);
await page.keyboard.press("4");
await page.keyboard.press("c");
for (let i = 0; i < 6; i++) {
  await wait(60);
  await page.screenshot({ path: `${out}/f${i}.png`, clip: { x: 100, y: 250, width: 300, height: 220 } });
  console.log(await world(`JSON.stringify({ cam: [w.cameras.main.scrollX, w.cameras.main.scrollY], f: w.body.facing, tool: w.tool && { kind: w.tool.kind, idx: w.tool.anim.index }, img: w.toolImage && { v: w.toolImage.visible, x: w.toolImage.x, y: w.toolImage.y, d: w.toolImage.depth, frame: w.toolImage.frame.name, tex: w.toolImage.texture.key } })`));
}
await page.screenshot({ path: `${out}/pick.png` });
await wait(2500);
console.log(await world(`JSON.stringify({ inv: w.params.state.inventory.filter(Boolean).map(function (i) { return i.id + "x" + i.stack; }), drops: w.drops.length, stone: w.entities.some(function (e) { return e.kind === "object" && e.x === ${spot.sx} && e.y === ${spot.y}; }) })`));
await page.screenshot({ path: `${out}/after.png` });
await browser.close();
