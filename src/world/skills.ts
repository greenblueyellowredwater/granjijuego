export const SKILLS = ["farming", "fishing", "foraging", "mining", "combat", "luck"] as const;
export type Skill = 0 | 1 | 2 | 3 | 4 | 5;
export const FARMING: Skill = 0, FISHING: Skill = 1, FORAGING: Skill = 2, MINING: Skill = 3, COMBAT: Skill = 4;

const BASE = [100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000];

export const baseExperienceForLevel = (level: number) => BASE[level - 1] ?? -1;

export function checkForLevelGain(oldXp: number, newXp: number) {
  for (let level = 10; level >= 1; level--) if (oldXp < baseExperienceForLevel(level) && newXp >= baseExperienceForLevel(level)) return level;
  return -1;
}

export function levelForExperience(xp: number) {
  let level = 0;
  for (let l = 1; l <= 10; l++) if (xp >= baseExperienceForLevel(l)) level = l;
  return level;
}

export interface SkillState {
  experience: number[];
  newLevels: [number, number][];
}

export function gainExperience(s: SkillState, skill: Skill, amount: number) {
  if (skill === 5 || amount <= 0) return;
  const old = s.experience[skill] ?? 0;
  const before = levelForExperience(old);
  const gained = checkForLevelGain(old, old + amount);
  s.experience[skill] = old + amount;
  if (gained > before) for (let l = before + 1; l <= gained; l++) s.newLevels.push([skill, l]);
}

export const harvestExperience = (price: number) => Math.round(Math.fround(16 * Math.log(0.018 * price + 1)));

export const farmerLevel = (levels: number[]) => Math.trunc(levels.slice(0, 6).reduce((a, b) => a + b, 0) / 2);

export function farmerTitleKey(levels: number[], male: boolean) {
  const level = farmerLevel(levels);
  if (level >= 30) return "Farmer.cs.2016";
  if (level < 3) return "Farmer.cs.2032";
  const keys = ["2031", "2030", "2029", "2028", "2027", "2026", "2025", male ? "2023" : "2024", "2022", "2021", "2020", "2019", "2018"];
  const i = level - 3;
  return `Farmer.cs.${i >= 26 ? "2017" : keys[Math.trunc(i / 2)]}`;
}
