import type { Entity, SeasonName } from "./terrain.ts";
import { DEFAULT_APPEARANCE, type Appearance } from "./farmer-appearance.ts";
import { startingInventory, type Item } from "./items.ts";

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
  weather: string;
  weatherForTomorrow: string;
  inventory: (Item | null)[];
  currentToolIndex: number;
  stamina: number;
  maxStamina: number;
  waterLeft: number;
  flags: string[];
  shipping: Item[];
  friendship: Record<string, { points: number; talkedToday: boolean }>;
  farmerName: string;
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
    weather: "Sun",
    weatherForTomorrow: "Sun",
    inventory: startingInventory(),
    currentToolIndex: 0,
    stamina: 270,
    maxStamina: 270,
    waterLeft: 40,
    flags: [],
    shipping: [],
    friendship: {},
    farmerName: "Granjero",
    appearance: DEFAULT_APPEARANCE,
    locations: {},
  };
}

export function withDefaults(state: GameState): GameState {
  return {
    ...state,
    dayOfMonth: state.dayOfMonth ?? 1,
    year: state.year ?? 1,
    money: state.money ?? 500,
    weather: state.weather ?? "Sun",
    weatherForTomorrow: state.weatherForTomorrow ?? "Sun",
    inventory: state.inventory ?? startingInventory(),
    currentToolIndex: state.currentToolIndex ?? 0,
    stamina: state.stamina ?? 270,
    maxStamina: state.maxStamina ?? 270,
    waterLeft: state.waterLeft ?? 40,
    flags: state.flags ?? [],
    shipping: state.shipping ?? [],
    friendship: state.friendship ?? {},
    farmerName: state.farmerName ?? "Granjero",
  };
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
