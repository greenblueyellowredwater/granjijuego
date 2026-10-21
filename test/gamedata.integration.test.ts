import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { GeneratedSchemes } from "../tools/clr/gamedata-schemes.ts";
import { generateGameDataSchemes } from "../tools/clr/gamedata-schemes.ts";
import { decompressXnb } from "../tools/lzx.ts";
import { configureXnb, readXnb } from "../tools/xnb.ts";

const dir = process.env.STARDEW_DIR;
const available = !!dir && existsSync(join(dir, "StardewValley.GameData.dll"));

describe.skipIf(!available)("contra la instalación real (STARDEW_DIR)", () => {
  let schemes: GeneratedSchemes;
  beforeAll(() => {
    schemes = generateGameDataSchemes(join(dir!, "StardewValley.GameData.dll"));
  });

  it("genera esquemas para los modelos de datos principales", () => {
    expect(schemes.schemes["StardewValley.GameData.Crops.CropData"]).toMatchObject({ RegrowDays: "Int32", $HarvestItemId: "String" });
    expect(schemes.enums).toContain("StardewValley.Season");
  });

  it("lee todos los Data/*.xnb sin errores", () => {
    configureXnb(schemes);
    const data = join(dir!, "Content", "Data");
    const failures: string[] = [];
    for (const f of readdirSync(data).filter((n) => n.endsWith(".xnb"))) {
      try {
        readXnb(decompressXnb(readFileSync(join(data, f))));
      } catch (e) {
        failures.push(`${f}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
