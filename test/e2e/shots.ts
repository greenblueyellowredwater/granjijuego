import { existsSync, mkdirSync } from "node:fs";
import puppeteer, { type KeyInput } from "puppeteer-core";

const BASE = process.env.E2E_URL ?? "http://localhost:5173";
const CHROME = process.env.CHROME_PATH ?? ["/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const [outDir = "test/e2e/out", ...specs] = process.argv.slice(2);

if (!CHROME) throw new Error("No encontré Chrome; definí CHROME_PATH");
if (specs.length === 0) {
  console.error("Uso: npm run shots -- <carpeta> nombre=map=Town:x=43:y=57[@tecla:ms] [...]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1280, height: 800 },
});
for (const spec of specs) {
  const i = spec.indexOf("=");
  const name = spec.slice(0, i);
  const [rawQuery, hold] = spec.slice(i + 1).split("@");
  const query = rawQuery.replace(/:/g, "&");
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error(`  [pageerror] ${e.message}`));
  await page.goto(`${BASE}/?${query}`);
  let status = "";
  for (let k = 0; k < 60 && !/tile/.test(status); k++) {
    await new Promise((r) => setTimeout(r, 500));
    status = await page.$eval("#props", (e) => e.textContent ?? "");
  }
  await new Promise((r) => setTimeout(r, 800));
  if (hold) {
    const [key, ms] = hold.split(":");
    await page.keyboard.down(key as KeyInput);
    await new Promise((r) => setTimeout(r, Number(ms)));
    await page.keyboard.up(key as KeyInput);
    await new Promise((r) => setTimeout(r, 300));
    status = await page.$eval("#props", (e) => e.textContent ?? "");
  }
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`${name}: ${status.split("\n")[0]}`);
  await page.close();
}
await browser.close();
