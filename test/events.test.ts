import { describe, expect, it } from "vitest";
import { checkPrecondition, commandArgs, orderedEntries, EventRunner, findEvent, parseCommands, type EventHost, type PreconditionContext } from "../src/world/events.ts";

const ctx = (over: Partial<PreconditionContext> = {}): PreconditionContext => ({
  seen: new Set(),
  mail: new Set(),
  time: 900,
  dayOfWeek: 1,
  dayOfMonth: 1,
  season: "spring",
  year: 1,
  daysPlayed: 5,
  raining: false,
  weather: "Sun",
  friendship: (n) => (n === "Abigail" ? 500 : null),
  dating: () => false,
  spouse: null,
  npcHere: (n) => n === "Pierre",
  npcVisible: () => true,
  totalEarned: 1000,
  money: 500,
  tile: { x: 3, y: 4 },
  hasItem: () => false,
  activeDialogueEvents: new Set(),
  skillLevel: () => 0,
  random: () => 0.5,
  ...over,
});

function host(log: string[] = []): EventHost {
  return {
    speak: (a, t, done) => {
      log.push(`speak ${a}: ${t}`);
      done();
    },
    message: (t, done) => {
      log.push(`message ${t}`);
      done();
    },
    question: (t, answers, done) => {
      log.push(`question ${t} [${answers.join("|")}]`);
      done(1);
    },
    loadScript: (k) => (k === "branch" ? 'message "branch"/end' : null),
    hasMail: () => false,
    addMail: (m) => log.push(`mail ${m}`),
    giveItem: (id, n) => log.push(`item ${id} ${n}`),
    removeItem: () => {},
    addQuest: (q) => log.push(`quest ${q}`),
    removeQuest: () => {},
    friendship: () => {},
    addRecipe: (k, n) => log.push(`recipe ${k} ${n}`),
    addConversationTopic: () => {},
    money: () => {},
    fade: (_a, _b, done) => done(),
    actorExists: (n) => n === "Marlon" || n === "Abigail",
    viewportSize: () => ({ w: 1280, h: 720 }),
    mapSize: () => ({ w: 3000, h: 2000 }),
    outdoors: () => true,
    log: (t) => log.push(`log ${t}`),
  };
}

function run(r: EventRunner, ms = 20000) {
  for (let t = 0; t < ms && !r.finished; t += 16) r.update(16);
}

describe("eventos: textos y condiciones", () => {
  it("separa comandos y argumentos respetando comillas", () => {
    expect(parseCommands('music/1 2/farmer 1 2 0/speak Abigail "Hi/there"/end')).toEqual(["music", "1 2", "farmer 1 2 0", 'speak Abigail "Hi/there"', "end"]);
    expect(commandArgs('speak Abigail "Hello there"')).toEqual(["speak", "Abigail", "Hello there"]);
  });

  it("evalúa condiciones con sus alias y la negación", () => {
    expect(checkPrecondition("f Abigail 250", ctx())).toBe(true);
    expect(checkPrecondition("f Abigail 2500", ctx())).toBe(false);
    expect(checkPrecondition("t 600 1200", ctx())).toBe(true);
    expect(checkPrecondition("d Mon Tue", ctx())).toBe(false);
    expect(checkPrecondition("z winter", ctx())).toBe(true);
    expect(checkPrecondition("w rainy", ctx())).toBe(false);
    expect(checkPrecondition("p Pierre", ctx())).toBe(true);
    expect(checkPrecondition("!p Pierre", ctx())).toBe(false);
    expect(checkPrecondition("y 2", ctx())).toBe(false);
    expect(checkPrecondition("e 5 6", ctx({ seen: new Set(["6"]) }))).toBe(true);
    expect(checkPrecondition("a 3 4", ctx())).toBe(true);
  });

  it("elige el primer evento elegible no visto", () => {
    const events = orderedEntries('{ "1/t 1000 1100": "a", "2/f Abigail 250": "b", "3": "c", "branch": "x" }');
    expect(findEvent(events, ctx())).toEqual({ id: "2", script: "b" });
    expect(findEvent(events, ctx({ seen: new Set(["2"]) }))).toEqual({ id: "3", script: "c" });
  });
});

describe("eventos: ejecución", () => {
  it("ubica actores, mueve, habla, entrega y termina", () => {
    const log: string[] = [];
    const r = new EventRunner("100162", 'MarlonsTheme/21 9/farmer -100 -100 0 Marlon 23 6 2/addQuest 14/skippable/move Marlon 0 2 2/speak Marlon "Hmmm..."/awardFestivalPrize sword/end', host(log), { x: 640, y: 656, facing: 0 });
    expect(r.actors.map((a) => [a.name, a.x, a.y])).toEqual([["Marlon", 1472, 384]]);
    run(r);
    expect(r.actors[0].y).toBe(496);
    expect(r.actors[0].facing).toBe(2);
    expect(log).toEqual(["quest 14", "speak Marlon: Hmmm...", "item (W)0 1"]);
    expect(r.end).toEqual({ kind: "default" });
  });

  it("saltar el evento de Marlon da la espada", () => {
    const log: string[] = [];
    const r = new EventRunner("100162", "none/21 9/farmer 1 1 0/skippable/pause 100000/end", host(log), { x: 0, y: 0, facing: 0 });
    r.update(16);
    expect(r.skip(() => false)).toBe(true);
    expect(log).toEqual(["item (W)0 1"]);
  });

  it("las pausas avanzan por tiempo y las preguntas rápidas insertan su rama", () => {
    const log: string[] = [];
    const r = new EventRunner("9", 'none/1 1/farmer 1 1 0/pause 500/quickQuestion ¿Sí?#Uno#Dos(break)message "uno"(break)message "dos"\\mail ok/end warpOut', host(log), { x: 0, y: 0, facing: 0 });
    for (let t = 0; t < 400; t += 16) r.update(16);
    expect(log).toEqual([]);
    run(r);
    expect(log).toEqual(["question ¿Sí? [Uno|Dos]", "message dos", "mail ok"]);
    expect(r.end).toEqual({ kind: "warpOut" });
  });

  it("question fork y fork cambian de guion", () => {
    const log: string[] = [];
    const r = new EventRunner("9", 'none/1 1/farmer 1 1 0/question fork1 "¿Ir?#No#Sí"/fork branch/message "no"/end', host(log), { x: 0, y: 0, facing: 0 });
    run(r);
    expect(log).toEqual(["question ¿Ir? [No|Sí]", "message branch"]);
  });
});
