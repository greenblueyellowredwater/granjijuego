import { fertilizerWaterRetention } from "./farming.ts";
import { cropNewDay, isInSeason, type CropData } from "./crops.ts";
import type { GameState } from "./state.ts";
import type { SeasonName } from "./terrain.ts";

export function dirtDecayChance(locationName: string) {
  if (locationName === "Greenhouse") return 0;
  if (locationName === "Farm" || locationName === "IslandWest") return 0.1;
  return 1;
}

export function dayUpdateLocations(state: GameState, crops: Record<string, CropData>, raining: boolean, random: () => number = Math.random) {
  const season: SeasonName = state.season;
  for (const [name, loc] of Object.entries(state.locations)) {
    const outdoors = name !== "Greenhouse";
    for (const e of loc.entities) {
      if (e.kind !== "hoeDirt") continue;
      if (e.crop) {
        const data = crops[e.crop.seed];
        cropNewDay(e.crop, data, e.watered, season, outdoors);
        if (outdoors && season === "winter" && data && !isInSeason(data, season)) e.crop = null;
      }
      if (!(random() < fertilizerWaterRetention(e.fertilizer))) e.watered = false;
    }
    const chance = dirtDecayChance(name);
    loc.entities = loc.entities.filter((e) => !(e.kind === "hoeDirt" && !e.crop && random() < chance));
    if (raining && outdoors) for (const e of loc.entities) if (e.kind === "hoeDirt") e.watered = true;
  }
}
