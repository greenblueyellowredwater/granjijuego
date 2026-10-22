export const PROFESSION_NAMES = [
  "Rancher", "Tiller", "Coopmaster", "Shepherd", "Artisan", "Agriculturist",
  "Fisher", "Trapper", "Angler", "Pirate", "Mariner", "Luremaster",
  "Forester", "Gatherer", "Lumberjack", "Tapper", "Botanist", "Tracker",
  "Miner", "Geologist", "Blacksmith", "Prospector", "Excavator", "Gemologist",
  "Fighter", "Scout", "Brute", "Defender", "Acrobat", "Desperado",
];

const SKILL_NAMES = ["Farming", "Fishing", "Foraging", "Mining", "Combat", "Luck"];
export const LEVEL_ICONS: Record<number, [number, number]> = { 0: [0, 0], 1: [16, 0], 2: [80, 0], 3: [32, 0], 4: [128, 16], 5: [64, 0] };

export function extraInfoKeys(skill: number, level: number) {
  switch (skill) {
    case 0:
      return ["LevelUp_ExtraInfo_Farming1", "LevelUp_ExtraInfo_Farming2"];
    case 3:
      return ["LevelUp_ExtraInfo_Mining"];
    case 1:
      return ["LevelUp_ExtraInfo_Fishing"];
    case 2:
      return ["LevelUp_ExtraInfo_Foraging1", ...(level === 1 ? ["LevelUp_ExtraInfo_Foraging2"] : level === 4 || level === 8 ? ["LevelUp_ExtraInfo_Foraging3"] : [])];
    case 4:
      return ["LevelUp_ExtraInfo_Combat"];
    case 5:
      return ["LevelUp_ExtraInfo_Luck"];
    default:
      return [];
  }
}

export function professionChoices(skill: number, level: number, owned: number[]) {
  if (level === 5) return [skill * 6, skill * 6 + 1];
  if (level !== 10) return null;
  return owned.includes(skill * 6) ? [skill * 6 + 2, skill * 6 + 3] : [skill * 6 + 4, skill * 6 + 5];
}

export interface RecipeUnlock {
  name: string;
  cooking: boolean;
  output: string;
  big: boolean;
  displayName: string | null;
}

export function parseLevelRequirement(raw: string, cooking: boolean) {
  const fields = raw.split("/");
  const cond = fields[cooking ? 3 : 4];
  if (!cond) return null;
  const parts = cond.split(" ");
  const offset = parts[0]?.toLowerCase() === "s" ? 1 : 0;
  if (parts.length < offset + 2) return null;
  const skill = SKILL_NAMES.findIndex((s) => s.toLowerCase() === parts[offset].toLowerCase());
  const level = Number(parts[offset + 1]);
  return skill < 0 || !Number.isFinite(level) ? null : { skill, level };
}

export function recipesUnlockedAt(skill: number, level: number, recipes: { crafting: Record<string, string>; cooking: Record<string, string> }): RecipeUnlock[] {
  const out: RecipeUnlock[] = [];
  for (const cooking of [false, true]) {
    for (const [name, raw] of Object.entries(cooking ? recipes.cooking : recipes.crafting)) {
      const req = parseLevelRequirement(raw, cooking);
      if (!req || req.skill !== skill || req.level !== level) continue;
      const fields = raw.split("/");
      const big = !cooking && fields[3] === "true";
      const outId = fields[2].split(" ")[0];
      out.push({ name, cooking, output: outId.startsWith("(") ? outId : `(${big ? "BC" : "O"})${outId}`, big, displayName: fields[cooking ? 4 : 5] || null });
    }
  }
  return out;
}

export const levelUpMenuHeight = (unlocks: RecipeUnlock[], extraInfo: number) => unlocks.reduce((h, r) => h + (r.big ? 128 : 64), 0) + 256 + Math.trunc((extraInfo * 64 * 3) / 4);

export function learnDefaultRecipes(known: { craftingRecipes: string[]; cookingRecipes: string[] }, recipes: { crafting: Record<string, string>; cooking: Record<string, string> }) {
  for (const [name, raw] of Object.entries(recipes.crafting)) if (raw.split("/")[4] === "default" && !known.craftingRecipes.includes(name)) known.craftingRecipes.push(name);
  for (const [name, raw] of Object.entries(recipes.cooking)) if (raw.split("/")[3] === "default" && !known.cookingRecipes.includes(name)) known.cookingRecipes.push(name);
}
