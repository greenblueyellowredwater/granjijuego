import { describe, expect, it } from "vitest";
import { localStore, locationEntities, newGameState } from "../src/world/state.ts";

function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe("estado de partida", () => {
  it("empieza como una partida nueva del original", () => {
    const s = newGameState(() => 0.5);
    expect(s).toMatchObject({ daysPlayed: 1, season: "spring", locations: {} });
    expect(s.uniqueId).toBe(Math.floor(0.5 * 2 ** 48));
  });

  it("genera cada location una sola vez y lo persiste", () => {
    const store = localStore(fakeStorage());
    const state = store.load();
    let calls = 0;
    const gen = () => (calls++, [{ kind: "object" as const, x: 1, y: 2, itemId: "343" }]);
    expect(locationEntities(state, "Town", gen).created).toBe(true);
    store.save(state);
    const again = store.load();
    expect(again.uniqueId).toBe(state.uniqueId);
    expect(locationEntities(again, "Town", gen)).toEqual({ entities: [{ kind: "object", x: 1, y: 2, itemId: "343" }], created: false });
    expect(calls).toBe(1);
  });

  it("reset crea una partida distinta", () => {
    const store = localStore(fakeStorage());
    const first = store.load();
    first.locations.Town = { entities: [] };
    store.save(first);
    const fresh = store.reset();
    expect(fresh.locations).toEqual({});
  });

  it("funciona sin almacenamiento disponible", () => {
    const store = localStore(null);
    expect(store.load().daysPlayed).toBe(1);
  });
});
