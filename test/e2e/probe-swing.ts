import puppeteer from "puppeteer-core";
const out = process.argv[2];
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const world = (expr: string) => page.evaluate(`(() => { const w = window.__game.scene.getScene("World"); return ${expr}; })()`);
await page.goto("http://localhost:5173/?map=Town&x=43&y=60&time=900");
await wait(5000);
for (const [slot, facing] of [["4", 1], ["4", 2], ["4", 3], ["4", 0], ["1", 1], ["3", 2], ["3", 1]] as const) {
  for (const idx of [0, 1, 2, 3]) {
    await world(`(function () { w.body.facing = ${facing}; w.tool = null; return 1; })()`);
    await page.keyboard.press(slot);
    await world(`(function () { w.useToolButton(); if (!w.tool) return 0; w.tool.anim.index = ${idx}; w.tool.anim.tick = function () {}; return 1; })()`);
    await wait(300);
    await page.screenshot({ path: `${out}/s${slot}-f${facing}-i${idx}.png`, clip: { x: 480, y: 220, width: 320, height: 300 } });
  }
}
await world(`(w.tool = null, 1)`);
await browser.close();
