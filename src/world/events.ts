import { startEmote, updateEmote, type Emote } from "./emotes.ts";

export function splitQuoteAware(input: string, delimiter: string, keepQuotes: boolean) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "\\" && input[i + 1] === '"') {
      cur += keepQuotes ? '\\"' : '"';
      i++;
      continue;
    }
    if (c === '"') {
      quoted = !quoted;
      if (keepQuotes) cur += c;
      continue;
    }
    if (c === delimiter && !quoted) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

export const parseCommands = (script: string) => splitQuoteAware(script, "/", true);
export const commandArgs = (command: string) => splitQuoteAware(command, " ", false);

export interface PreconditionContext {
  seen: Set<string>;
  mail: Set<string>;
  time: number;
  dayOfWeek: number;
  dayOfMonth: number;
  season: string;
  year: number;
  daysPlayed: number;
  raining: boolean;
  weather: string;
  friendship: (npc: string) => number | null;
  dating: (npc: string) => boolean;
  spouse: string | null;
  npcHere: (npc: string) => boolean;
  npcVisible: (npc: string) => boolean;
  totalEarned: number;
  money: number;
  tile: { x: number; y: number };
  hasItem: (id: string) => boolean;
  activeDialogueEvents: Set<string>;
  skillLevel: (skill: string) => number;
  random: () => number;
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function dayOfWeekFor(raw: string) {
  if (/^\d+$/.test(raw)) return Number(raw) % 7;
  const s = raw.toLowerCase().slice(0, 3);
  return DAYS.indexOf(s);
}

const ALIASES: Record<string, string> = {
  e: "SawEvent",
  h: "MissingPet",
  H: "IsHost",
  Hn: "HostMail",
  Hl: "NotHostMail",
  "*n": "HostOrLocalMail",
  "*l": "NotHostOrLocalMail",
  m: "EarnedMoney",
  M: "HasMoney",
  c: "FreeInventorySlots",
  C: "CommunityCenterOrWarehouseDone",
  X: "NotCommunityCenterOrWarehouseDone",
  D: "Dating",
  j: "DaysPlayed",
  J: "JojaBundlesDone",
  f: "Friendship",
  F: "NotFestivalDay",
  r: "Random",
  s: "Shipped",
  S: "SawSecretNote",
  q: "ChoseDialogueAnswers",
  n: "LocalMail",
  N: "GoldenWalnuts",
  l: "NotLocalMail",
  L: "InUpgradedHouse",
  t: "Time",
  w: "Weather",
  d: "NotDayOfWeek",
  O: "Spouse",
  o: "NotSpouse",
  R: "Roommate",
  Rf: "NotRoommate",
  v: "NpcVisible",
  p: "NpcVisibleHere",
  z: "NotSeason",
  B: "SpouseBed",
  b: "ReachedMineBottom",
  y: "Year",
  g: "Gender",
  i: "HasItem",
  k: "NotSawEvent",
  a: "Tile",
  A: "NotActiveDialogueEvent",
  x: "SendMail",
  u: "DayOfMonth",
  U: "NotUpcomingFestival",
  G: "GameStateQuery",
};

export function checkPrecondition(raw: string, ctx: PreconditionContext): boolean {
  let text = raw.trim();
  let negate = false;
  if (text.startsWith("!")) {
    negate = true;
    text = text.slice(1);
  }
  const args = commandArgs(text);
  const key = args[0];
  const name = ALIASES[key] ?? key;
  const result = evaluate(name, args, ctx);
  if (result === null) return false;
  return negate ? !result : result;
}

function evaluate(name: string, args: string[], ctx: PreconditionContext): boolean | null {
  const int = (i: number) => Number(args[i]);
  switch (name) {
    case "SawEvent":
      return args.slice(1).some((id) => ctx.seen.has(id));
    case "NotSawEvent":
      return !args.slice(1).some((id) => ctx.seen.has(id));
    case "IsHost":
      return true;
    case "HostMail":
    case "LocalMail":
    case "HostOrLocalMail":
      return ctx.mail.has(args[1]);
    case "NotHostMail":
    case "NotLocalMail":
    case "NotHostOrLocalMail":
      return !ctx.mail.has(args[1]);
    case "EarnedMoney":
      return ctx.totalEarned >= int(1);
    case "HasMoney":
      return ctx.money >= int(1);
    case "Dating":
      return ctx.dating(args[1]);
    case "DaysPlayed":
      return ctx.daysPlayed > int(1);
    case "Friendship":
      for (let i = 1; i + 1 < args.length; i += 2) {
        const points = ctx.friendship(args[i]);
        if (points === null || points < Number(args[i + 1])) return false;
      }
      return true;
    case "Random":
      return ctx.random() < Number(args[1]);
    case "Time":
      return ctx.time >= int(1) && ctx.time <= int(2);
    case "Weather":
      if (args[1] === "rainy") return ctx.raining;
      if (args[1] === "sunny") return !ctx.raining;
      return args[1] === ctx.weather;
    case "NotDayOfWeek":
      return !args.slice(1).some((d) => dayOfWeekFor(d) === ctx.dayOfWeek);
    case "Spouse":
      return ctx.spouse === args[1];
    case "NotSpouse":
      return ctx.spouse !== args[1];
    case "Roommate":
      return false;
    case "NotRoommate":
      return true;
    case "NpcVisible":
      return ctx.npcVisible(args[1]);
    case "NpcVisibleHere":
      return ctx.npcHere(args[1]);
    case "NotSeason":
      return !args.slice(1).some((s) => s.toLowerCase() === ctx.season);
    case "Year":
      return int(1) === 1 ? ctx.year === 1 : ctx.year >= int(1);
    case "HasItem":
      return ctx.hasItem(args[1]);
    case "Tile":
      for (let i = 1; i + 1 < args.length; i += 2) if (ctx.tile.x === Number(args[i]) && ctx.tile.y === Number(args[i + 1])) return true;
      return false;
    case "NotActiveDialogueEvent":
      return !ctx.activeDialogueEvents.has(args[1]);
    case "DayOfMonth":
      return args.slice(1).some((d) => Number(d) === ctx.dayOfMonth);
    case "NotFestivalDay":
      return true;
    case "NotUpcomingFestival":
      return true;
    case "MissingPet":
      return false;
    case "InUpgradedHouse":
      return false;
    case "CommunityCenterOrWarehouseDone":
    case "JojaBundlesDone":
    case "SpouseBed":
    case "ReachedMineBottom":
      return false;
    case "NotCommunityCenterOrWarehouseDone":
      return true;
    case "Skill":
      return ctx.skillLevel(args[1]) >= int(2);
    default:
      return null;
  }
}

export function eventIdIfEligible(key: string, ctx: PreconditionContext, seenSinceLocationChange: Set<string> = new Set()) {
  const parts = key.split("/");
  const id = parts[0];
  if (!id || id === "-1") return null;
  if (ctx.seen.has(id) || seenSinceLocationChange.has(id)) return null;
  for (const p of parts.slice(1)) if (p && !checkPrecondition(p, ctx)) return null;
  return id;
}

export function orderedEntries(json: string): [string, string][] {
  const values = JSON.parse(json) as Record<string, string>;
  const keys: string[] = [];
  let depth = 0;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === '"') {
      let j = i + 1;
      while (j < json.length && json[j] !== '"') j += json[j] === "\\" ? 2 : 1;
      const raw = json.slice(i, j + 1);
      let k = j + 1;
      while (k < json.length && /\s/.test(json[k])) k++;
      if (depth === 1 && json[k] === ":") keys.push(JSON.parse(raw) as string);
      i = j;
    }
  }
  return keys.map((k) => [k, values[k]]);
}

export function findEvent(events: [string, string][], ctx: PreconditionContext) {
  for (const [key, script] of events) {
    if (key.startsWith("PlayerKilled")) continue;
    if (!/^-?\d+$/.test(key.split("/")[0])) continue;
    const id = eventIdIfEligible(key, ctx);
    if (id) return { id, script };
  }
  return null;
}

export interface EventActor {
  name: string;
  x: number;
  y: number;
  facing: number;
  frame: number;
  flip: boolean;
  speed: number;
  moving: boolean;
  walkTimer: number;
  walkFrame: number;
  animation: { frames: number[]; interval: number; loop: boolean; flip: boolean; index: number; timer: number } | null;
  fixedFrame: number | null;
  jumpOffset: number;
  jumpVelocity: number;
  shake: number;
  emote: Emote | null;
  emoteDone: (() => void) | null;
  textAboveHead: { text: string; ms: number } | null;
  invisible: boolean;
  isFarmer: boolean;
}

export function newActor(name: string, tx: number, ty: number, facing: number, isFarmer = false): EventActor {
  return {
    name,
    x: tx * 64,
    y: isFarmer ? ty * 64 + 16 : ty * 64,
    facing,
    frame: 0,
    flip: false,
    speed: 2,
    moving: false,
    walkTimer: 0,
    walkFrame: 0,
    animation: null,
    fixedFrame: null,
    jumpOffset: 0,
    jumpVelocity: 0,
    shake: 0,
    emote: null,
    emoteDone: null,
    textAboveHead: null,
    invisible: false,
    isFarmer,
  };
}

export function parseDirection(raw: string | undefined) {
  if (raw === undefined) return 2;
  const n = Number(raw);
  if (Number.isInteger(n)) return ((n % 4) + 4) % 4;
  return { up: 0, right: 1, down: 2, left: 3 }[raw.toLowerCase()] ?? 2;
}

export const isFarmerName = (name: string) => name === "farmer" || /^farmer\d$/.test(name);

export interface EventHost {
  speak(actor: string, text: string, done: () => void): void;
  message(text: string, done: () => void): void;
  question(text: string, answers: string[], done: (index: number) => void): void;
  loadScript(key: string): string | null;
  hasMail(id: string): boolean;
  addMail(id: string): void;
  removeMail(id: string): void;
  mailForTomorrow(id: string): void;
  giveItem(id: string, count: number): void;
  removeItem(id: string, count: number): void;
  addQuest(id: string): void;
  removeQuest(id: string): void;
  friendship(npc: string, amount: number): void;
  addRecipe(kind: "crafting" | "cooking", name: string): void;
  addConversationTopic(id: string, days: number): void;
  money(amount: number): void;
  fade(toBlack: boolean, speed: number, done: () => void): void;
  actorExists(name: string): boolean;
  viewportSize(): { w: number; h: number };
  mapSize(): { w: number; h: number };
  outdoors(): boolean;
  log(text: string): void;
}

export interface EventEnd {
  kind: "default" | "warpOut" | "newDay" | "bed" | "position" | "invisible" | "invisibleWarpOut" | "dialogue" | "dialogueWarpOut" | "beginGame";
  npc?: string;
  text?: string;
  position?: { x: number; y: number };
}

export const SKIP_REWARDS: Record<string, { items?: string[]; crafting?: string[]; cooking?: string[]; quests?: string[]; mail?: string[]; end?: EventEnd }> = {
  "33": { crafting: ["Drum Block", "Flute Block"] },
  "980559": { items: ["(T)TrainingRod"] },
  "-888999": { items: ["(O)864"], quests: ["130"] },
  "690006": { items: ["(O)680"] },
  "191393": { items: ["(BC)116"], end: { kind: "position", position: { x: 52, y: 20 } } },
  "2123343": { end: { kind: "newDay" } },
  "404798": { items: ["(T)Pan"] },
  "26": { crafting: ["Wild Bait"] },
  "3091462": { items: ["(F)1802"] },
  "3918602": { items: ["(F)1309"] },
  "19": { cooking: ["Cookies"] },
  "992553": { crafting: ["Furnace"], quests: ["11"] },
  "900553": { crafting: ["Garden Pot"], items: ["(BC)62"] },
  "980558": { crafting: ["Mini-Jukebox"], items: ["(BC)209"] },
  "60367": { end: { kind: "beginGame" } },
  "739330": { items: ["(T)BambooPole"], end: { kind: "position", position: { x: 43, y: 36 } } },
  "112": { mail: ["canReadJunimoText"] },
  "100162": { items: ["(W)0"] },
};

const DIR: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const WALK_ROW: Record<number, number> = { 0: 2, 1: 1, 2: 0, 3: 3 };

export class EventRunner {
  commands: string[];
  current = 3;
  actors: EventActor[] = [];
  farmer: EventActor;
  pause = 0;
  viewport: { x: number; y: number } | null = null;
  follow = false;
  viewportTarget: { x: number; y: number; ms: number } | null = null;
  moves = new Map<string, { x: number; y: number; facing: number }>();
  continueAfterMove = false;
  speakTimer = 0;
  specialVariable = false;
  finished = false;
  end: EventEnd | null = null;
  skippable = false;
  waiting = false;
  farmerSpeed = 0;
  ambientLight: [number, number, number] | null = null;
  globalFade: { alpha: number; target: number; speed: number; done: (() => void) | null } | null = null;
  invisibleTiles: { x: number; y: number }[] = [];
  private host: EventHost;

  constructor(
    readonly id: string,
    script: string,
    host: EventHost,
    farmer: { x: number; y: number; facing: number },
  ) {
    this.host = host;
    this.commands = parseCommands(script);
    this.farmer = { ...newActor("farmer", 0, 0, farmer.facing, true), x: farmer.x, y: farmer.y };
    this.initialize();
  }

  private initialize() {
    const camera = this.commands[1] ?? "follow";
    if (camera === "follow") this.follow = true;
    else {
      const [x, y] = camera.split(/\s+/).map(Number);
      this.viewport = this.clampViewport(x, y);
    }
    const parts = (this.commands[2] ?? "").split(/\s+/).filter(Boolean);
    for (let i = 0; i + 3 < parts.length; i += 4) {
      const name = parts[i];
      const tx = Number(parts[i + 1]), ty = Number(parts[i + 2]), facing = Number(parts[i + 3]);
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
      if (isFarmerName(name)) {
        if (tx === -1) continue;
        this.farmer.x = tx * 64;
        this.farmer.y = ty * 64 + 16;
        this.farmer.facing = facing;
        continue;
      }
      if (!this.host.actorExists(name)) continue;
      this.actors.push(newActor(name, tx, ty, facing));
    }
    if (this.commands[3] === "ignoreEventTileOffset") this.current = 4;
  }

  clampViewport(tx: number, ty: number) {
    const v = this.host.viewportSize();
    const m = this.host.mapSize();
    let x = tx * 64 + 32 - Math.trunc(v.w / 2), y = ty * 64 + 32 - Math.trunc(v.h / 2);
    if (this.host.outdoors()) {
      x = Math.max(0, Math.min(x, m.w - v.w));
      y = Math.max(0, Math.min(y, m.h - v.h));
    }
    if (x > 0 && v.w > m.w) x = Math.trunc((m.w - v.w) / 2);
    if (y > 0 && v.h > m.h) y = Math.trunc((m.h - v.h) / 2);
    return { x, y };
  }

  actor(name: string): EventActor | null {
    if (isFarmerName(name)) return this.farmer;
    return this.actors.find((a) => a.name === name) ?? null;
  }

  next(immediate = false) {
    this.current++;
    if (immediate) this.runCommand();
  }

  update(ms: number) {
    if (this.finished) return;
    for (const a of [this.farmer, ...this.actors]) this.updateActor(a, ms);
    if (this.globalFade) {
      const f = this.globalFade;
      f.alpha += (f.target > f.alpha ? 1 : -1) * f.speed * (ms / 16.666);
      if ((f.target === 1 && f.alpha >= 1) || (f.target === 0 && f.alpha <= 0)) {
        f.alpha = f.target;
        const done = f.done;
        f.done = null;
        done?.();
      }
    }
    if (this.viewportTarget && this.viewport) {
      this.viewport.x += this.viewportTarget.x;
      this.viewport.y += this.viewportTarget.y;
      this.viewportTarget.ms -= ms;
      if (this.viewportTarget.ms <= 0) this.viewportTarget = null;
    }
    if (this.moves.size > 0) {
      this.stepMoves();
      if (this.moves.size > 0 && !this.continueAfterMove) return;
      if (this.moves.size === 0) {
        if (this.continueAfterMove) this.continueAfterMove = false;
        else this.current++;
      }
    }
    if (this.pause > 0) {
      this.pause -= ms;
      if (this.pause <= 0) {
        this.pause = 0;
        this.current++;
      }
      return;
    }
    if (this.waiting) return;
    if (this.current >= this.commands.length) {
      this.finish({ kind: "default" });
      return;
    }
    this.runCommand(ms);
  }

  private updateActor(a: EventActor, ms: number) {
    if (a.jumpVelocity !== 0 || a.jumpOffset !== 0) {
      a.jumpOffset -= a.jumpVelocity * (ms / 16.666);
      a.jumpVelocity -= 0.5 * (ms / 16.666);
      if (a.jumpOffset >= 0) {
        a.jumpOffset = 0;
        a.jumpVelocity = 0;
      }
    }
    if (a.shake > 0) a.shake -= ms;
    if (a.emote) {
      a.emote = updateEmote(a.emote, ms);
      if (!a.emote && a.emoteDone) {
        const done = a.emoteDone;
        a.emoteDone = null;
        done();
      }
    }
    if (a.textAboveHead) {
      a.textAboveHead.ms -= ms;
      if (a.textAboveHead.ms <= 0) a.textAboveHead = null;
    }
    const anim = a.animation;
    if (anim) {
      anim.timer += ms;
      if (anim.timer >= anim.interval) {
        anim.timer = 0;
        if (anim.index + 1 < anim.frames.length) anim.index++;
        else if (anim.loop) anim.index = 0;
      }
      a.frame = anim.frames[anim.index];
      a.flip = anim.flip;
    }
  }

  private stepMoves() {
    for (const [name, target] of [...this.moves]) {
      const a = this.actor(name);
      if (!a) {
        this.moves.delete(name);
        continue;
      }
      const box = a.isFarmer ? { x: a.x + 8, y: a.y, w: 48, h: 32 } : { x: a.x + 8, y: a.y + 16, w: 48, h: 32 };
      const rect = { x: target.x * 64 + 4, y: target.y * 64, w: 56, h: 64 };
      const contains = box.x >= rect.x && box.y >= rect.y && box.x + box.w <= rect.x + rect.w && box.y + box.h <= rect.y + rect.h;
      if (contains && box.y - rect.y <= 16 + (a.isFarmer ? 2 : 0)) {
        a.moving = false;
        a.facing = target.facing;
        a.walkFrame = 0;
        this.moves.delete(name);
        continue;
      }
      const speed = a.isFarmer ? 2 + this.farmerSpeed : a.speed;
      a.x += DIR[a.facing][0] * speed;
      a.y += DIR[a.facing][1] * speed;
      a.moving = true;
      a.walkTimer += 16;
      if (a.walkTimer > (a.isFarmer ? 120 : 175)) {
        a.walkTimer = 0;
        a.walkFrame = (a.walkFrame + 1) % 4;
      }
    }
  }

  npcFrame(a: EventActor) {
    if (a.animation || a.fixedFrame !== null) return a.frame;
    return (WALK_ROW[a.facing] ?? 0) * 4 + (a.moving ? a.walkFrame : 0);
  }

  finish(end: EventEnd) {
    if (this.finished) return;
    this.finished = true;
    this.end = end;
  }

  skip(hasItem: (id: string) => boolean) {
    if (!this.skippable) return false;
    const r = SKIP_REWARDS[this.id];
    if (r) {
      for (const id of r.items ?? []) if (!hasItem(id)) this.host.giveItem(id, 1);
      for (const name of r.crafting ?? []) this.host.addRecipe("crafting", name);
      for (const name of r.cooking ?? []) this.host.addRecipe("cooking", name);
      for (const q of r.quests ?? []) this.host.addQuest(q);
      for (const m of r.mail ?? []) this.host.addMail(m);
    }
    this.finish(r?.end ?? { kind: "default" });
    return true;
  }

  private runCommand(ms = 16) {
    const raw = this.commands[Math.min(this.commands.length - 1, this.current)];
    if (!raw || raw.startsWith("--")) {
      this.current++;
      return;
    }
    const args = commandArgs(raw);
    const name = args[0].toLowerCase();
    const h = this.host;
    switch (name) {
      case "pause":
        if (this.pause <= 0) this.pause = Number(args[1]);
        return;
      case "move": {
        const extra = (args.length - 1) % 4;
        const cont = extra === 1 ? args[args.length - 1].toLowerCase() === "true" : null;
        for (let i = 1; i + 3 < args.length; i += 4) {
          const a = this.actor(args[i]);
          if (!a || this.moves.has(a.name)) continue;
          const dx = Number(args[i + 1]), dy = Number(args[i + 2]);
          const facing = parseDirection(args[i + 3]);
          a.animation = null;
          a.fixedFrame = null;
          const tx = Math.floor((a.x + 32) / 64), ty = Math.floor((a.y + (a.isFarmer ? 16 : 32)) / 64);
          a.facing = dx > 0 ? 1 : dx < 0 ? 3 : dy > 0 ? 2 : dy < 0 ? 0 : a.facing;
          this.moves.set(a.name, { x: tx + dx, y: ty + dy, facing });
        }
        if (cont === true) {
          this.continueAfterMove = true;
          this.current++;
        } else if (cont === false) this.continueAfterMove = false;
        if (this.moves.size === 0 && !this.continueAfterMove) this.current++;
        return;
      }
      case "speak": {
        this.speakTimer += ms;
        if (this.speakTimer < 500) return;
        this.speakTimer = 0;
        this.waiting = true;
        h.speak(args[1], args[2] ?? "", () => {
          this.waiting = false;
          this.current++;
        });
        return;
      }
      case "message":
        this.waiting = true;
        h.message(args[1] ?? "", () => {
          this.waiting = false;
          this.current++;
        });
        return;
      case "facedirection": {
        const a = this.actor(args[1]);
        if (a) {
          a.facing = parseDirection(args[2]);
          a.animation = null;
          a.fixedFrame = null;
        }
        if (args[3] === "true") this.next(true);
        else if (this.pause <= 0) this.pause = 500;
        return;
      }
      case "showframe": {
        const actorName = args.length === 2 ? "farmer" : args[1];
        const frame = Number(args.length === 2 ? args[1] : args[2]);
        const a = this.actor(actorName);
        if (a) {
          a.animation = null;
          a.fixedFrame = frame;
          a.frame = frame;
          a.flip = args[3] === "true";
        }
        this.next(true);
        return;
      }
      case "emote": {
        const a = this.actor(args[1]);
        if (!a) {
          this.current++;
          return;
        }
        if (!a.emote) a.emote = startEmote(Number(args[2]));
        if (args[3] === "true") this.next(true);
        else {
          this.waiting = true;
          a.emoteDone = () => {
            this.waiting = false;
            this.current++;
          };
        }
        return;
      }
      case "warp": {
        const a = this.actor(args[1]);
        if (a) {
          if (a.isFarmer) {
            a.x = Number(args[2]) * 64;
            a.y = Number(args[3]) * 64;
          } else {
            a.x = Number(args[2]) * 64 + 4;
            a.y = Number(args[3]) * 64;
          }
        }
        this.next(args[4] === "true");
        return;
      }
      case "speed": {
        const a = this.actor(args[1]);
        if (a?.isFarmer) this.farmerSpeed = Number(args[2]);
        else if (a) a.speed = Number(args[2]);
        this.current++;
        return;
      }
      case "positionoffset": {
        const a = this.actor(args[1]);
        if (a) {
          a.x += Number(args[2]);
          a.y += Number(args[3]);
        }
        this.next(args[4] === "true");
        return;
      }
      case "jump": {
        const a = this.actor(args[1]);
        if (a) a.jumpVelocity = args[2] !== undefined && !Number.isNaN(Number(args[2])) ? Number(args[2]) : 8;
        this.next(true);
        return;
      }
      case "animate": {
        const a = this.actor(args[1]);
        if (a) {
          const frames = args.slice(5).map(Number);
          a.animation = { frames, interval: Number(args[4]), loop: args[3] === "true", flip: args[2] === "true", index: 0, timer: 0 };
          a.frame = frames[0];
        }
        this.next(true);
        return;
      }
      case "stopanimation": {
        const a = this.actor(args[1]);
        if (a) {
          a.animation = null;
          if (a.isFarmer) {
            a.fixedFrame = null;
          } else if (args[2] !== undefined && Number(args[2]) > -1) {
            a.fixedFrame = Number(args[2]);
            a.frame = Number(args[2]);
          } else a.fixedFrame = null;
        }
        this.next(true);
        return;
      }
      case "viewport": {
        if (args[1] === "move") {
          this.viewportTarget = { x: Number(args[2]), y: Number(args[3]), ms: Number(args[4]) };
          this.current++;
          return;
        }
        let tx: number, ty: number, rest: string[];
        if (Number.isNaN(Number(args[1]))) {
          const a = args[1] === "player" ? this.farmer : this.actor(args[1]);
          tx = a ? Math.round(a.x / 64) : 0;
          ty = a ? Math.round(a.y / 64) : 0;
          rest = args.slice(2);
        } else {
          tx = Number(args[1]);
          ty = Number(args[2]);
          rest = args.slice(3);
        }
        this.follow = false;
        const v = h.viewportSize(), m = h.mapSize();
        let x = tx * 64 + 32 - Math.trunc(v.w / 2), y = ty * 64 + 32 - Math.trunc(v.h / 2);
        if (x > 0 && v.w > m.w) x = Math.trunc((m.w - v.w) / 2);
        if (y > 0 && v.h > m.h) y = Math.trunc((m.h - v.h) / 2);
        if (rest[0] === "clamp") {
          if (m.w >= v.w) x = Math.max(0, Math.min(x, m.w - v.w));
          else x = Math.trunc(m.w / 2 - v.w / 2);
          if (m.h >= v.h) y = Math.max(0, Math.min(y, m.h - v.h));
          else y = Math.trunc(m.h / 2 - v.h / 2);
        }
        if (rest.includes("unfreeze")) this.follow = true;
        this.viewport = { x, y };
        this.current++;
        return;
      }
      case "globalfade":
      case "globalfadetoclear": {
        const toBlack = name === "globalfade";
        const speed = args[1] !== undefined ? Number(args[1]) : 0.007;
        const cont = args[2] === "true";
        if (this.globalFade?.done) return;
        this.globalFade = { alpha: this.globalFade?.alpha ?? (toBlack ? 0 : 1), target: toBlack ? 1 : 0, speed, done: cont ? null : () => this.current++ };
        if (cont) this.current++;
        return;
      }
      case "fade":
        if (args[1] === "unfade") this.globalFade = null;
        else this.globalFade = { alpha: 1, target: 1, speed: 1, done: null };
        this.current++;
        return;
      case "question": {
        const parts = (args[2] ?? "").split("#").map((s) => s.trim());
        this.waiting = true;
        h.question(parts[0], parts.slice(1), (i) => {
          this.waiting = false;
          if (args[1].includes("fork") && i === Number(args[1].replace("fork", ""))) this.specialVariable = !this.specialVariable;
          this.current++;
        });
        return;
      }
      case "quickquestion": {
        const body = raw.slice(raw.indexOf(" ") + 1);
        const sections = body.split("(break)");
        const parts = sections[0].split("#").map((s) => s.trim());
        this.waiting = true;
        h.question(parts[0], parts.slice(1), (i) => {
          this.waiting = false;
          const branch = sections[i + 1];
          if (branch) this.commands.splice(this.current + 1, 0, ...branch.split("\\").map((s) => s.trim()).filter(Boolean));
          this.current++;
        });
        return;
      }
      case "fork": {
        let required: string | null = args[1], key = args[2];
        if (!key) {
          key = required;
          required = null;
        }
        const go = required ? h.hasMail(required) : this.specialVariable;
        if (!go) {
          this.current++;
          return;
        }
        this.switchTo(key);
        return;
      }
      case "switchevent":
        this.switchTo(args[1]);
        return;
      case "skippable":
        this.skippable = true;
        this.current++;
        return;
      case "unskippable":
        this.skippable = false;
        this.current++;
        return;
      case "textabovehead": {
        const a = this.actor(args[1]);
        if (a) a.textAboveHead = { text: args[2] ?? "", ms: 3000 };
        this.current++;
        return;
      }
      case "shake": {
        const a = this.actor(args[1]);
        if (a) a.shake = Number(args[2]);
        this.current++;
        return;
      }
      case "halt":
        for (const a of [this.farmer, ...this.actors]) a.moving = false;
        this.moves.clear();
        this.continueAfterMove = false;
        this.current++;
        return;
      case "addquest":
        h.addQuest(args[1]);
        this.current++;
        return;
      case "removequest":
        h.removeQuest(args[1]);
        this.current++;
        return;
      case "mail":
        h.mailForTomorrow(args[1]);
        this.current++;
        return;
      case "addmailreceived":
      case "mailreceived":
        if (args[2] === "false") h.removeMail(args[1]);
        else h.addMail(args[1]);
        this.current++;
        return;
      case "friendship":
        h.friendship(args[1], Number(args[2]));
        this.current++;
        return;
      case "money":
        h.money(Number(args[1]));
        this.current++;
        return;
      case "additem":
        h.giveItem(args[1], args[2] ? Number(args[2]) : 1);
        this.current++;
        return;
      case "removeitem":
        h.removeItem(args[1], args[2] ? Number(args[2]) : 1);
        this.current++;
        return;
      case "addcraftingrecipe":
      case "addcookingrecipe":
        h.addRecipe(name === "addcraftingrecipe" ? "crafting" : "cooking", raw.slice(raw.indexOf(" ") + 1).trim());
        this.current++;
        return;
      case "addconversationtopic":
        h.addConversationTopic(args[1], args[2] ? Number(args[2]) : 4);
        this.current++;
        return;
      case "awardfestivalprize":
        if (args[1] === "sword") h.giveItem("(W)0", 1);
        else if (args[1]) h.giveItem(args[1], 1);
        this.current++;
        return;
      case "makeinvisible":
        this.invisibleTiles.push({ x: Number(args[1]), y: Number(args[2]) });
        this.current++;
        return;
      case "ambientlight":
        this.ambientLight = [Number(args[1]), Number(args[2]), Number(args[3])];
        this.current++;
        return;
      case "end":
        this.endWith(args);
        return;
      default:
        h.log(`comando de evento sin implementar: ${args[0]}`);
        this.current++;
    }
  }

  private switchTo(key: string) {
    const script = this.host.loadScript(key);
    if (!script) {
      this.current++;
      return;
    }
    this.commands = parseCommands(script);
    this.current = 0;
  }

  private endWith(args: string[]) {
    const kind = args[1];
    switch (kind) {
      case "warpOut":
        this.finish({ kind: "warpOut" });
        return;
      case "newDay":
        this.finish({ kind: "newDay" });
        return;
      case "bed":
        this.finish({ kind: "bed" });
        return;
      case "beginGame":
        this.finish({ kind: "beginGame" });
        return;
      case "position":
        this.finish({ kind: "position", position: { x: Number(args[2]), y: Number(args[3]) } });
        return;
      case "invisible":
        this.finish({ kind: "invisible", npc: args[2] });
        return;
      case "invisibleWarpOut":
        this.finish({ kind: "invisibleWarpOut", npc: args[2] });
        return;
      case "dialogue":
        this.finish({ kind: "dialogue", npc: args[2], text: args[3] });
        return;
      case "dialogueWarpOut":
        this.finish({ kind: "dialogueWarpOut", npc: args[2], text: args[3] });
        return;
      default:
        this.finish({ kind: "default" });
    }
  }
}
