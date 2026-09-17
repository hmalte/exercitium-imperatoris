// Tests for per-muscle stimulus counting.

import { describe, it, expect } from "vitest";
import { computeMuscleStats, lastRecordedBodyweight, type MuscleStats } from "./volume";
import type {
  ExerciseFile,
  Muscle,
  SessionFile,
  SetEntry,
} from "./schemas";

// Helpers keep each test short + readable. The SessionFile / ExerciseFile
// shapes have plenty of fields we don't care about per test — these
// factories fill the uninteresting bits with sensible defaults.

function exercise(
  id: string,
  primary: Muscle[],
  secondary: Muscle[],
  bodyweight = false,
): ExerciseFile {
  return {
    id,
    displayName: id,
    primaryMuscles: primary,
    secondaryMuscles: secondary,
    rotationSlots: ["push"],
    order: 1,
    targetSets: 4,
    equipment: bodyweight ? "bodyweight" : "barbell",
    progression: "double",
    bodyweight,
    notes: "",
  };
}

function session(
  date: string,
  exerciseName: string,
  sets: SetEntry[],
  bodyweightKg: number | null = null,
): SessionFile {
  return {
    date,
    rotationPosition: 0,
    rotationSlot: "push",
    isCardioWeek: false,
    sleepHours: null,
    bodyweightKg,
    cardioMinutes: null,
    cardioType: null,
    cleanseType: null,
    exercises: [{ name: exerciseName, sets }],
    notes: "",
  };
}

function muscleRow(rows: MuscleStats[], muscle: Muscle): MuscleStats {
  return rows.find((r) => r.muscle === muscle)!;
}

describe("computeMuscleStats", () => {
  it("returns a row for every known muscle (zeros when nothing was trained)", () => {
    const rows = computeMuscleStats([], [], 14, "2026-04-19");
    // There should be 16 rows (matching MUSCLES.length from schemas).
    expect(rows.length).toBeGreaterThanOrEqual(16);
    for (const row of rows) {
      expect(row.sets).toBe(0);
      expect(row.tonnageKg).toBe(0);
      expect(row.reps).toBe(0);
    }
  });

  it("counts 1.0 set per primary muscle per logged set", () => {
    const ex = exercise("bench_press", ["chest", "front_delts"], ["triceps"]);
    const sessions = [
      session("2026-04-18", "bench_press", [
        { reps: 5, weightKg: 80 },
        { reps: 5, weightKg: 80 },
        { reps: 5, weightKg: 80 },
      ]),
    ];
    const rows = computeMuscleStats(sessions, [ex], 14, "2026-04-19");
    expect(muscleRow(rows, "chest").sets).toBe(3);
    expect(muscleRow(rows, "front_delts").sets).toBe(3);
  });

  it("counts 0.5 sets per secondary muscle", () => {
    const ex = exercise("bench_press", ["chest"], ["triceps"]);
    const sessions = [
      session("2026-04-18", "bench_press", [
        { reps: 5, weightKg: 80 },
        { reps: 5, weightKg: 80 },
      ]),
    ];
    const rows = computeMuscleStats(sessions, [ex], 14, "2026-04-19");
    expect(muscleRow(rows, "triceps").sets).toBe(1.0); // 0.5 × 2
  });

  it("computes tonnage as reps × weight, weighted by primary/secondary", () => {
    const ex = exercise("bench_press", ["chest"], ["triceps"]);
    const sessions = [
      session("2026-04-18", "bench_press", [{ reps: 5, weightKg: 80 }]),
    ];
    const rows = computeMuscleStats(sessions, [ex], 14, "2026-04-19");
    expect(muscleRow(rows, "chest").tonnageKg).toBe(400); // 5 × 80
    expect(muscleRow(rows, "triceps").tonnageKg).toBe(200); // 0.5 × 400
  });

  it("uses the last recorded bodyweight as the load for bodyweight exercises", () => {
    const pullup = exercise("pullup", ["lats"], ["biceps"], true);
    const sessions = [
      // Bodyweight recorded on an earlier session that didn't include pullups.
      {
        ...session("2026-04-15", "pullup", [], 70),
        exercises: [],
      },
      session("2026-04-18", "pullup", [{ reps: 8, weightKg: 0 }]),
    ];
    const rows = computeMuscleStats(sessions, [pullup], 14, "2026-04-19");
    // 8 reps × 70 kg bodyweight = 560 kg tonnage on lats (primary).
    expect(muscleRow(rows, "lats").tonnageKg).toBe(560);
    // Secondary biceps: 0.5 × 560.
    expect(muscleRow(rows, "biceps").tonnageKg).toBe(280);
    // Sets unaffected — still 1 full primary set.
    expect(muscleRow(rows, "lats").sets).toBe(1);
  });

  it("adds logged weight on top of bodyweight for weighted-bodyweight sets", () => {
    // e.g. weighted dips with a 10kg belt.
    const dips = exercise("dips", ["chest"], [], true);
    const sessions = [
      session("2026-04-18", "dips", [{ reps: 6, weightKg: 10 }], 70),
    ];
    const rows = computeMuscleStats(sessions, [dips], 14, "2026-04-19");
    // (70 bodyweight + 10 belt) × 6 reps = 480 kg.
    expect(muscleRow(rows, "chest").tonnageKg).toBe(480);
  });

  it("falls back to 0 tonnage for bodyweight exercises when no bodyweight is known", () => {
    const pullup = exercise("pullup", ["lats"], [], true);
    const sessions = [session("2026-04-18", "pullup", [{ reps: 8, weightKg: 0 }])];
    const rows = computeMuscleStats(sessions, [pullup], 14, "2026-04-19");
    // Sets still count.
    expect(muscleRow(rows, "lats").sets).toBe(1);
    expect(muscleRow(rows, "lats").reps).toBe(8);
    // But tonnage is 0 because we have no bodyweight to multiply by.
    expect(muscleRow(rows, "lats").tonnageKg).toBe(0);
  });

  it("excludes sessions outside the rolling window", () => {
    const ex = exercise("bench_press", ["chest"], []);
    const sessions = [
      session("2026-04-01", "bench_press", [{ reps: 5, weightKg: 80 }]), // too old
      session("2026-04-18", "bench_press", [{ reps: 5, weightKg: 80 }]), // in window
    ];
    const rows = computeMuscleStats(sessions, [ex], 14, "2026-04-19");
    expect(muscleRow(rows, "chest").sets).toBe(1);
    expect(muscleRow(rows, "chest").tonnageKg).toBe(400);
  });

  it("skips unknown exercise ids without crashing", () => {
    const ex = exercise("bench_press", ["chest"], []);
    const sessions = [
      session("2026-04-18", "mystery_lift", [{ reps: 5, weightKg: 80 }]),
      session("2026-04-18", "bench_press", [{ reps: 5, weightKg: 80 }]),
    ];
    const rows = computeMuscleStats(sessions, [ex], 14, "2026-04-19");
    expect(muscleRow(rows, "chest").sets).toBe(1);
  });
});

describe("lastRecordedBodyweight", () => {
  it("returns null when no session has ever recorded a bodyweight", () => {
    const sessions = [session("2026-04-10", "bench_press", [], null)];
    expect(lastRecordedBodyweight(sessions, "2026-04-19")).toBeNull();
  });

  it("returns the most recent recorded bodyweight at or before the date", () => {
    const sessions = [
      session("2026-04-05", "bench_press", [], 72),
      session("2026-04-12", "bench_press", [], 71),
      session("2026-04-20", "bench_press", [], 70), // AFTER asked date — ignored
    ];
    expect(lastRecordedBodyweight(sessions, "2026-04-19")).toBe(71);
  });

  it("ignores sessions with null bodyweight when looking backwards", () => {
    const sessions = [
      session("2026-04-05", "bench_press", [], 72),
      session("2026-04-12", "bench_press", [], null),
    ];
    expect(lastRecordedBodyweight(sessions, "2026-04-19")).toBe(72);
  });
});
