import { Location, type TiledMap } from "./location.ts";
import { parseSchedule, scheduleKey, type ScheduleContext } from "./npc-schedule.ts";
import { startOfDay, tickNpc, type GraphWarp, type NpcState, type NpcWorld } from "./npc-sim.ts";

export interface CharacterData {
  Home?: { Id?: string; Condition?: string | null; Location: string; Tile: { x: number; y: number }; Direction?: string | null }[] | null;
  Size?: { x: number; y: number } | null;
  CanSocialize?: string | null;
  BirthSeason?: number | string | null;
  BirthDay?: number;
  Manner?: number | string;
  CanBeRomanced?: boolean;
  CanReceiveGifts?: boolean;
}

const DIRECTIONS: Record<string, number> = { up: 0, right: 1, down: 2, left: 3 };

export function homeOf(data: CharacterData) {
  const h = data.Home?.find((x) => !x.Condition) ?? data.Home?.[0];
  if (!h) return null;
  return { location: h.Location, x: h.Tile.x, y: h.Tile.y, facing: DIRECTIONS[(h.Direction ?? "down").toLowerCase()] ?? 2 };
}

export class NpcManager implements NpcWorld {
  npcs: NpcState[] = [];
  dialogueToday: Record<string, { chunks: string[]; index: number }> = {};
  private homes = new Map<string, { location: string; x: number; y: number; facing: number }>();
  private readonly maps = new Map<string, Location | "loading">();

  constructor(
    readonly graph: Record<string, GraphWarp[]>,
    private readonly mapPathOf: (location: string) => string,
    private readonly fetchMap: (path: string) => Promise<TiledMap | null>,
  ) {}

  getLocation(name: string) {
    const cached = this.maps.get(name);
    if (cached instanceof Location) return cached;
    if (cached === "loading") return null;
    this.maps.set(name, "loading");
    this.fetchMap(this.mapPathOf(name)).then((map) => {
      if (map) this.maps.set(name, new Location(name, map));
    });
    return null;
  }

  provideLocation(location: Location) {
    this.maps.set(location.name, location);
  }

  setupDay(characters: Record<string, CharacterData>, schedules: Record<string, Record<string, string>>, ctx: Omit<ScheduleContext, "hearts">, available: (name: string) => boolean) {
    this.npcs = [];
    this.dialogueToday = {};
    for (const [name, data] of Object.entries(characters)) {
      const home = homeOf(data);
      if (!home || !available(name)) continue;
      this.homes.set(name, home);
      const raw = schedules[name];
      let entries = raw ? (() => {
        const key = scheduleKey(name, raw, { ...ctx, hearts: 0 });
        return key ? parseSchedule(name, key, raw, home, { ...ctx, hearts: 0 }) : null;
      })() : null;
      entries ??= [];
      this.npcs.push(startOfDay(name, home, entries));
    }
  }

  fastForward(time: number) {
    for (const n of this.npcs) {
      while (n.next < n.schedule.length && n.schedule[n.next].time <= time) {
        const e = n.schedule[n.next++];
        n.location = e.location;
        n.x = e.x * 64;
        n.y = e.y * 64;
        n.facing = e.facing;
      }
    }
  }

  homeOf(name: string) {
    return this.homes.get(name) ?? null;
  }

  tick(time: number, ms = 16) {
    for (const n of this.npcs) tickNpc(n, time, this, ms);
  }

  in(location: string) {
    return this.npcs.filter((n) => n.location === location);
  }
}
