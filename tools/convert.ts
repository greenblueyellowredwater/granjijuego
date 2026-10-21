import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { PNG } from "pngjs";
import { decompressXnb } from "./lzx.ts";
import { parseTbin } from "./tbin.ts";
import { tbinToTiled } from "./tiled.ts";
import { readXnb } from "./xnb.ts";

export type Converted =
  | { kind: "texture"; key: string; width: number; height: number }
  | { kind: "map" | "data" | "font"; key: string }
  | { kind: "skipped" | "copied"; rel: string }
  | { kind: "error"; rel: string; error: string };

function writePng(file: string, width: number, height: number, rgba: Uint8Array) {
  const png = new PNG({ width, height });
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  writeFileSync(file, PNG.sync.write(png, { deflateLevel: 6 }));
}

export function convertFile(contentDir: string, rel: string, outDir: string): Converted {
  const key = rel.replace(/\.[^./]+$/, "");
  const target = join(outDir, key);
  try {
    if (!rel.endsWith(".xnb")) {
      if (!rel.endsWith(".fnt") && !rel.endsWith(".json")) return { kind: "skipped", rel };
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(contentDir, rel), join(outDir, rel));
      return { kind: "copied", rel };
    }
    const { content: c } = readXnb(decompressXnb(readFileSync(join(contentDir, rel))));
    mkdirSync(dirname(target), { recursive: true });
    const exp = c?.export;
    if (exp?.type === "Texture2D") {
      writePng(`${target}.png`, exp.width, exp.height, exp.data);
      return { kind: "texture", key, width: exp.width, height: exp.height };
    }
    if (exp?.type === "TBin") {
      const mapDir = posix.dirname(key);
      const { json } = tbinToTiled(parseTbin(new Uint8Array(exp.data)), (image) => posix.normalize(posix.join(mapDir, image)));
      writeFileSync(`${target}.tmj`, JSON.stringify(json));
      return { kind: "map", key };
    }
    if (exp?.type === "BmFont") {
      writeFileSync(`${target}.fnt`, exp.data);
      return { kind: "font", key };
    }
    if (c?.texture?.export?.type === "Texture2D") {
      const t = c.texture.export;
      writePng(`${target}.png`, t.width, t.height, t.data);
      const { texture: _t, ...glyphs } = c;
      writeFileSync(`${target}.spritefont.json`, JSON.stringify(glyphs));
      return { kind: "font", key };
    }
    if (exp?.type === "Effect") return { kind: "skipped", rel };
    writeFileSync(`${target}.json`, JSON.stringify(c));
    return { kind: "data", key };
  } catch (e) {
    return { kind: "error", rel, error: (e as Error).message };
  }
}
