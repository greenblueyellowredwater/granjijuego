import type { Entity, SeasonName } from "./terrain.ts";
import { DEFAULT_APPEARANCE, type Appearance } from "./farmer-appearance.ts";

const STORAGE_KEY = "stardew-ts/partida";
const VERSION = 1;

export interface GameState {
  version: number;
  uniqueId: number;
  daysPlayed: number;
  season: SeasonName;
  dayOfMonth: number;
  year: number;
  money: number;
  appearance?: Appearance;
  locations: Record<string, { entities: Entity[] }>;
}

export function newGameState(random = Math.random): GameState {
  return {
    version: VERSION,
    uniqueId: Math.floor(random() * 2 ** 48),
    daysPlayed: 1,
    season: "spring",
    dayOfMonth: 1,
    year: 1,
    money: 500,
    appearance: DEFAULT_APPEARANCE,
    locations: {},
  };
}

export function withDefaults(state: GameState): GameState {
  return { ...state, dayOfMonth: state.dayOfMonth ?? 1, year: state.year ?? 1, money: state.money ?? 500 };
}

export interface StateStore {
  load(): GameState;
  save(state: GameState): void;
  reset(): GameState;
}

export function localStore(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = safeLocalStorage()): StateStore {
  return {
    load() {
      try {
        const raw = storage?.getItem(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as GameState) : null;
        if (parsed?.version === VERSION) return withDefaults(parsed);
      } catch {
        return newGameState();
      }
      const fresh = newGameState();
      this.save(fresh);
      return fresh;
    },
    save(state) {
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        return;
      }
    },
    reset() {
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        return this.load();
      }
      return this.load();
    },
  };
}

function safeLocalStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function locationEntities(state: GameState, name: string, generate: () => Entity[]) {
  const existing = state.locations[name];
  if (existing) return { entities: existing.entities, created: false };
  const entities = generate();
  state.locations[name] = { entities };
  return { entities, created: true };
}
