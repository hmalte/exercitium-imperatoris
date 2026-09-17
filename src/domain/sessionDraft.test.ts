// Unit tests for the session-draft store.
//
// These confirm the rules the Ritual relies on:
//   1. A draft from a different date is never returned.
//   2. An unknown schema version is never returned.
//   3. Garbage in localStorage never throws.
//   4. Clear really clears.
//
// Vitest runs in the node environment (see vitest.config.ts) — no jsdom —
// so we plant a minimal in-memory shim at `globalThis.window` before
// every case. It mimics just enough of the Storage API for the module
// under test to function.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRitualDraft,
  loadRitualDraft,
  saveRitualDraft,
  type RitualDraft,
} from "./sessionDraft";

const STORAGE_KEY = "exercitium-ritual-draft";

function makeFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  };
}

function sampleDraft(date: string): RitualDraft {
  return {
    date,
    version: 2,
    step: "logging",
    sleepHours: 7.5,
    bodyweightKg: 80,
    cardioMinutes: null,
    cardioType: null,
    cleanseType: null,
    cardioQuote: "",
    cardioNotes: "",
    workingExercises: [
      {
        exerciseId: "bench_press",
        displayName: "Bench Press",
        bodyweight: false,
        sets: [
          { reps: 5, weightKg: 80 },
          { reps: 5, weightKg: 82.5 },
        ],
        closed: false,
      },
    ],
  };
}

describe("sessionDraft", () => {
  let fakeStorage: Storage;

  beforeEach(() => {
    fakeStorage = makeFakeStorage();
    vi.stubGlobal("window", { localStorage: fakeStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a draft saved today", () => {
    const draft = sampleDraft("2026-04-20");
    saveRitualDraft(draft);
    expect(loadRitualDraft("2026-04-20")).toEqual(draft);
  });

  it("ignores a draft from a different date", () => {
    saveRitualDraft(sampleDraft("2026-04-19"));
    expect(loadRitualDraft("2026-04-20")).toBeNull();
  });

  it("ignores a draft with an unknown schema version", () => {
    const malformed = { ...sampleDraft("2026-04-20"), version: 99 };
    fakeStorage.setItem(STORAGE_KEY, JSON.stringify(malformed));
    expect(loadRitualDraft("2026-04-20")).toBeNull();
  });

  it("returns null for garbage JSON", () => {
    fakeStorage.setItem(STORAGE_KEY, "not-json-at-all");
    expect(loadRitualDraft("2026-04-20")).toBeNull();
  });

  it("returns null when nothing has been stored", () => {
    expect(loadRitualDraft("2026-04-20")).toBeNull();
  });

  it("clearRitualDraft wipes the stored copy", () => {
    saveRitualDraft(sampleDraft("2026-04-20"));
    clearRitualDraft();
    expect(loadRitualDraft("2026-04-20")).toBeNull();
  });

  it("saveRitualDraft swallows storage errors (quota exceeded, disabled, etc.)", () => {
    const throwingStorage: Storage = {
      ...makeFakeStorage(),
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    vi.stubGlobal("window", { localStorage: throwingStorage });
    expect(() => saveRitualDraft(sampleDraft("2026-04-20"))).not.toThrow();
  });

  // Closing is why the draft carries the flag at all: a recovered session
  // that reopened everything would start prompting again for work the user
  // had already declared finished.
  it("restores which lifts were closed", () => {
    const base = sampleDraft("2026-04-20");
    const draft: RitualDraft = {
      ...base,
      workingExercises: [
        { ...base.workingExercises[0], closed: true },
        {
          exerciseId: "dips",
          displayName: "Dips (assisted)",
          bodyweight: true,
          sets: [],
          closed: false,
        },
      ],
    };
    saveRitualDraft(draft);
    expect(
      loadRitualDraft("2026-04-20")?.workingExercises.map((w) => w.closed),
    ).toEqual([true, false]);
  });
});
