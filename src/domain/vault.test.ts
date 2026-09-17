// Vault CRUD tests, using the in-memory adapter so no disk is touched.

import { describe, it, expect } from "vitest";
import {
  InMemoryVaultAdapter,
  saveSession,
  loadAllSessions,
  saveExercise,
  loadAllExercises,
  saveLoA,
  loadAllLoAs,
  saveQuotes,
  loadQuotes,
} from "./vault";
import type { SessionFile, ExerciseFile, LoAFile } from "./schemas";

const sampleSession: SessionFile = {
  date: "2026-04-19",
  rotationPosition: 3,
  rotationSlot: "push",
  isCardioWeek: false,
  sleepHours: 7.5,
  bodyweightKg: 72,
  cardioMinutes: null,
  cardioType: null,
  cleanseType: null,
  exercises: [
    { name: "bench_press", sets: [{ reps: 6, weightKg: 80 }] },
  ],
  notes: "",
};

const sampleExercise: ExerciseFile = {
  id: "bench_press",
  displayName: "Bench Press",
  primaryMuscles: ["chest"],
  secondaryMuscles: ["triceps"],
  rotationSlots: ["push"],
  order: 1,
  targetSets: 4,
  equipment: "barbell",
  progression: "double",
  bodyweight: false,
  notes: "",
};

const sampleLoA: LoAFile = {
  start: "2026-04-10",
  end: "2026-04-15",
  reason: "vacation",
  notes: "",
};

describe("sessions", () => {
  it("round-trips through save/load", async () => {
    const adapter = new InMemoryVaultAdapter();
    await saveSession(adapter, sampleSession);
    const [loaded] = await loadAllSessions(adapter);
    expect(loaded).toEqual(sampleSession);
  });

  it("returns empty list when the sessions folder doesn't exist yet", async () => {
    const adapter = new InMemoryVaultAdapter();
    expect(await loadAllSessions(adapter)).toEqual([]);
  });

  it("returns sessions sorted by date ascending", async () => {
    const adapter = new InMemoryVaultAdapter();
    await saveSession(adapter, { ...sampleSession, date: "2026-04-15" });
    await saveSession(adapter, { ...sampleSession, date: "2026-04-10" });
    await saveSession(adapter, { ...sampleSession, date: "2026-04-20" });
    const sessions = await loadAllSessions(adapter);
    expect(sessions.map((s) => s.date)).toEqual([
      "2026-04-10",
      "2026-04-15",
      "2026-04-20",
    ]);
  });

  it("overwrites an existing session on the same date", async () => {
    const adapter = new InMemoryVaultAdapter();
    await saveSession(adapter, sampleSession);
    await saveSession(adapter, { ...sampleSession, sleepHours: 9 });
    const [loaded] = await loadAllSessions(adapter);
    expect(loaded.sleepHours).toBe(9);
  });
});

describe("exercises", () => {
  it("round-trips through save/load", async () => {
    const adapter = new InMemoryVaultAdapter();
    await saveExercise(adapter, sampleExercise);
    const [loaded] = await loadAllExercises(adapter);
    expect(loaded).toEqual(sampleExercise);
  });

  it("returns empty list when the folder doesn't exist yet", async () => {
    const adapter = new InMemoryVaultAdapter();
    expect(await loadAllExercises(adapter)).toEqual([]);
  });

  // The Ritual menu renders in load order, so this sort IS the workout's
  // running order. Ids are deliberately reverse-alphabetical to the intended
  // sequence — an id-only sort would return them backwards.
  it("sorts by order, not by id", async () => {
    const adapter = new InMemoryVaultAdapter();
    for (const [id, order] of [
      ["zeta_lift", 1],
      ["alpha_lift", 2],
      ["mid_lift", 3],
    ] as const) {
      await saveExercise(adapter, { ...sampleExercise, id, order });
    }
    const loaded = await loadAllExercises(adapter);
    expect(loaded.map((e) => e.id)).toEqual([
      "zeta_lift",
      "alpha_lift",
      "mid_lift",
    ]);
  });

  it("breaks order ties by id so the sort stays deterministic", async () => {
    const adapter = new InMemoryVaultAdapter();
    for (const id of ["b_lift", "a_lift", "c_lift"]) {
      await saveExercise(adapter, { ...sampleExercise, id, order: 7 });
    }
    const loaded = await loadAllExercises(adapter);
    expect(loaded.map((e) => e.id)).toEqual(["a_lift", "b_lift", "c_lift"]);
  });
});

describe("loas", () => {
  it("round-trips through save/load", async () => {
    const adapter = new InMemoryVaultAdapter();
    await saveLoA(adapter, sampleLoA);
    const [loaded] = await loadAllLoAs(adapter);
    expect(loaded).toEqual(sampleLoA);
  });
});

describe("quotes", () => {
  it("round-trips through save/load", async () => {
    const adapter = new InMemoryVaultAdapter();
    const quotes = ["In nomine Imperatoris.", "Heresy grows from idleness."];
    await saveQuotes(adapter, "pro_emperor", quotes);
    const loaded = await loadQuotes(adapter, "pro_emperor");
    expect(loaded).toEqual(quotes);
  });

  it("returns empty list when the quotes file doesn't exist", async () => {
    const adapter = new InMemoryVaultAdapter();
    expect(await loadQuotes(adapter, "disavowal")).toEqual([]);
  });

  it("keeps the two quote kinds separate", async () => {
    const adapter = new InMemoryVaultAdapter();
    await saveQuotes(adapter, "pro_emperor", ["A"]);
    await saveQuotes(adapter, "disavowal", ["B"]);
    expect(await loadQuotes(adapter, "pro_emperor")).toEqual(["A"]);
    expect(await loadQuotes(adapter, "disavowal")).toEqual(["B"]);
  });
});
