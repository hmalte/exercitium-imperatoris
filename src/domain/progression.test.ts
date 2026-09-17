// Tests for the double-progression suggestion logic.

import { describe, it, expect } from "vitest";
import { suggestNext } from "./progression";
import type { SessionFile, SetEntry } from "./schemas";

// Helper: build a minimal SessionFile with a single exercise + set list.
// The other SessionFile fields don't matter for progression — it only looks
// at `date` and `exercises`.
function makeSession(
  date: string,
  exerciseName: string,
  sets: SetEntry[],
): SessionFile {
  return {
    date,
    rotationPosition: 0,
    rotationSlot: "push",
    isCardioWeek: false,
    sleepHours: null,
    bodyweightKg: null,
    cardioMinutes: null,
    cardioType: null,
    cleanseType: null,
    exercises: [{ name: exerciseName, sets }],
    notes: "",
  };
}

describe("suggestNext", () => {
  it("returns a sensible first-time default when the user has never done the exercise", () => {
    const result = suggestNext("bench_press", []);
    expect(result.reps).toBe(5);
    expect(result.weightKg).toBe(0);
    expect(result.lastSets).toBeNull();
    expect(result.lastDate).toBeNull();
  });

  it("adds one rep when the last top set stayed inside the rep range", () => {
    const sessions = [
      makeSession("2026-04-10", "bench_press", [
        { reps: 5, weightKg: 80 },
        { reps: 5, weightKg: 80 },
      ]),
    ];
    const result = suggestNext("bench_press", sessions);
    expect(result.reps).toBe(6);
    expect(result.weightKg).toBe(80);
    expect(result.lastDate).toBe("2026-04-10");
    expect(result.lastSets).toHaveLength(2);
  });

  it("adds weight and resets reps when the last top set hit the rep ceiling with load", () => {
    const sessions = [
      makeSession("2026-04-10", "bench_press", [
        { reps: 8, weightKg: 80 },
        { reps: 7, weightKg: 80 },
      ]),
    ];
    const result = suggestNext("bench_press", sessions);
    expect(result.reps).toBe(3);
    expect(result.weightKg).toBe(82.5);
  });

  it("keeps adding reps past the ceiling on bodyweight lifts (weight=0)", () => {
    // Pullups at 8 reps — no weight to add, so we go 8 → 9 rather than
    // resetting to 3.
    const sessions = [
      makeSession("2026-04-10", "pullup", [
        { reps: 8, weightKg: 0 },
      ]),
    ];
    const result = suggestNext("pullup", sessions);
    expect(result.reps).toBe(9);
    expect(result.weightKg).toBe(0);
  });

  it("uses the most recent session when multiple exist", () => {
    const sessions = [
      makeSession("2026-04-01", "bench_press", [{ reps: 5, weightKg: 70 }]),
      makeSession("2026-04-15", "bench_press", [{ reps: 6, weightKg: 80 }]),
      makeSession("2026-04-08", "bench_press", [{ reps: 5, weightKg: 75 }]),
    ];
    const result = suggestNext("bench_press", sessions);
    expect(result.reps).toBe(7);
    expect(result.weightKg).toBe(80);
    expect(result.lastDate).toBe("2026-04-15");
  });

  it("ignores sessions that did not include the target exercise", () => {
    const sessions: SessionFile[] = [
      // More recent session, but doesn't contain bench_press.
      {
        date: "2026-04-15",
        rotationPosition: 1,
        rotationSlot: "pull",
        isCardioWeek: false,
        sleepHours: null,
        bodyweightKg: null,
        cardioMinutes: null,
        cardioType: null,
        cleanseType: null,
        exercises: [{ name: "pullup", sets: [{ reps: 8, weightKg: 0 }] }],
        notes: "",
      },
      makeSession("2026-04-10", "bench_press", [{ reps: 5, weightKg: 80 }]),
    ];
    const result = suggestNext("bench_press", sessions);
    expect(result.reps).toBe(6);
    expect(result.weightKg).toBe(80);
    expect(result.lastDate).toBe("2026-04-10");
  });

  it("uses the top (first) set as the baseline even when later sets are lighter", () => {
    // Top set 8×80 triggers weight bump; fatigue on later sets doesn't
    // downgrade the suggestion.
    const sessions = [
      makeSession("2026-04-10", "bench_press", [
        { reps: 8, weightKg: 80 },
        { reps: 5, weightKg: 80 },
        { reps: 3, weightKg: 80 },
      ]),
    ];
    const result = suggestNext("bench_press", sessions);
    expect(result.reps).toBe(3);
    expect(result.weightKg).toBe(82.5);
  });

  it("respects custom increment and rep range options", () => {
    const sessions = [
      makeSession("2026-04-10", "squat", [{ reps: 6, weightKg: 100 }]),
    ];
    const result = suggestNext("squat", sessions, {
      incrementKg: 5,
      minReps: 4,
      maxReps: 6,
    });
    // 6 reps hit the custom ceiling (6), weight > 0, so: +5 kg, reset to 4.
    expect(result.reps).toBe(4);
    expect(result.weightKg).toBe(105);
  });
});
