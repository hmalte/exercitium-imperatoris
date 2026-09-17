// Unit tests for the Codex Imperialis stats derivations.
//
// These are all pure functions over plain data, so each test builds a small
// synthetic SessionFile[] / ExerciseFile[] and checks the output shape.

import { describe, it, expect } from "vitest";
import type { SessionFile, ExerciseFile, LoAFile } from "./schemas";
import {
  epleyOneRepMax,
  bestEpleyForExercise,
  bodyweightTimeline,
  sleepTimeline,
  rollingAverage,
  weeklyVolumeByGroup,
  mondayOf,
  oneRepMaxSeriesByLift,
  streakRibbon,
} from "./stats";

// -----------------------------------------------------------------------------
// Fixture builders — tiny factories so each test's data is read-at-a-glance.
// -----------------------------------------------------------------------------

function session(
  overrides: Partial<SessionFile> & Pick<SessionFile, "date">,
): SessionFile {
  return {
    date: overrides.date,
    rotationPosition: overrides.rotationPosition ?? 0,
    rotationSlot: overrides.rotationSlot ?? "push",
    isCardioWeek: overrides.isCardioWeek ?? false,
    sleepHours: overrides.sleepHours ?? null,
    bodyweightKg: overrides.bodyweightKg ?? null,
    cardioMinutes: overrides.cardioMinutes ?? null,
    cardioType: overrides.cardioType ?? null,
    cleanseType: overrides.cleanseType ?? null,
    exercises: overrides.exercises ?? [],
    notes: overrides.notes ?? "",
  };
}

function exercise(
  overrides: Partial<ExerciseFile> & Pick<ExerciseFile, "id">,
): ExerciseFile {
  return {
    id: overrides.id,
    displayName: overrides.displayName ?? overrides.id,
    primaryMuscles: overrides.primaryMuscles ?? [],
    secondaryMuscles: overrides.secondaryMuscles ?? [],
    rotationSlots: overrides.rotationSlots ?? [],
    order: overrides.order ?? 1,
    targetSets: overrides.targetSets ?? 4,
    equipment: overrides.equipment ?? "barbell",
    progression: overrides.progression ?? "double",
    bodyweight: overrides.bodyweight ?? false,
    notes: overrides.notes ?? "",
  };
}

// -----------------------------------------------------------------------------
// epleyOneRepMax
// -----------------------------------------------------------------------------

describe("epleyOneRepMax", () => {
  it("adds the 1/30 nudge even at 1 rep (standard Epley, not capped)", () => {
    // 100 × (1 + 1/30) = 103.33. Some sources cap at 1-rep; we don't.
    expect(epleyOneRepMax(100, 1)).toBeCloseTo(103.333, 2);
  });

  it("adds ~23% at 7 reps (100 × 1.2333)", () => {
    // 100 * (1 + 7/30) ≈ 123.33
    expect(epleyOneRepMax(100, 7)).toBeCloseTo(123.333, 2);
  });

  it("zero reps returns zero (failed set doesn't imply a max)", () => {
    expect(epleyOneRepMax(100, 0)).toBe(0);
  });

  it("handles fractional weights and reps cleanly", () => {
    expect(epleyOneRepMax(80.5, 6)).toBeCloseTo(80.5 * (1 + 6 / 30), 5);
  });
});

describe("bestEpleyForExercise", () => {
  it("returns 0 when the exercise has never been logged", () => {
    expect(bestEpleyForExercise([], "bench_press")).toBe(0);
  });

  it("returns the highest Epley across all sessions' sets", () => {
    const sessions = [
      session({
        date: "2026-04-01",
        exercises: [
          {
            name: "bench_press",
            sets: [
              { reps: 5, weightKg: 80 }, // 80 × (1 + 5/30) ≈ 93.33
              { reps: 3, weightKg: 90 }, // 90 × (1 + 3/30) = 99
            ],
          },
        ],
      }),
      session({
        date: "2026-04-08",
        exercises: [
          {
            name: "bench_press",
            sets: [{ reps: 6, weightKg: 85 }], // 85 × 1.2 = 102
          },
        ],
      }),
      session({
        date: "2026-04-09",
        exercises: [
          {
            name: "other_lift",
            sets: [{ reps: 1, weightKg: 999 }],
          },
        ],
      }),
    ];
    expect(bestEpleyForExercise(sessions, "bench_press")).toBeCloseTo(102, 2);
  });
});

// -----------------------------------------------------------------------------
// Timelines
// -----------------------------------------------------------------------------

describe("bodyweightTimeline", () => {
  it("drops sessions that skipped the weigh-in", () => {
    const sessions = [
      session({ date: "2026-04-01", bodyweightKg: 82 }),
      session({ date: "2026-04-02", bodyweightKg: null }),
      session({ date: "2026-04-03", bodyweightKg: 82.2 }),
    ];
    const out = bodyweightTimeline(sessions);
    expect(out).toEqual([
      { date: "2026-04-01", value: 82 },
      { date: "2026-04-03", value: 82.2 },
    ]);
  });

  it("sorts points chronologically even if sessions are out of order", () => {
    const sessions = [
      session({ date: "2026-04-03", bodyweightKg: 82.2 }),
      session({ date: "2026-04-01", bodyweightKg: 82 }),
    ];
    const dates = bodyweightTimeline(sessions).map((p) => p.date);
    expect(dates).toEqual(["2026-04-01", "2026-04-03"]);
  });

  it("empty session list produces empty series", () => {
    expect(bodyweightTimeline([])).toEqual([]);
  });
});

describe("sleepTimeline", () => {
  it("drops null-sleep sessions", () => {
    const sessions = [
      session({ date: "2026-04-01", sleepHours: 7.5 }),
      session({ date: "2026-04-02", sleepHours: null }),
    ];
    expect(sleepTimeline(sessions)).toEqual([
      { date: "2026-04-01", value: 7.5 },
    ]);
  });
});

// -----------------------------------------------------------------------------
// rollingAverage
// -----------------------------------------------------------------------------

describe("rollingAverage", () => {
  it("mirrors the input when every point is its own window", () => {
    const series = [
      { date: "2026-04-01", value: 10 },
      { date: "2026-04-10", value: 20 },
    ];
    // 7-day windows — the two points are 9 days apart so neither falls
    // inside the other's window.
    const out = rollingAverage(series, 7);
    expect(out).toEqual([
      { date: "2026-04-01", value: 10 },
      { date: "2026-04-10", value: 20 },
    ]);
  });

  it("averages only points within [date - N + 1, date]", () => {
    const series = [
      { date: "2026-04-01", value: 10 },
      { date: "2026-04-03", value: 14 },
      { date: "2026-04-05", value: 18 },
    ];
    // At 2026-04-05 with a 7-day window: 10, 14, 18 all in range → avg 14.
    // At 2026-04-03 with a 7-day window: 10 and 14 in range → avg 12.
    // At 2026-04-01: just 10.
    const out = rollingAverage(series, 7);
    expect(out.map((p) => p.value)).toEqual([10, 12, 14]);
  });

  it("treats windowDays ≤ 0 as identity", () => {
    const series = [{ date: "2026-04-01", value: 42 }];
    expect(rollingAverage(series, 0)).toEqual(series);
    expect(rollingAverage(series, -5)).toEqual(series);
  });

  it("returns empty for empty input", () => {
    expect(rollingAverage([], 7)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// mondayOf
// -----------------------------------------------------------------------------

describe("mondayOf", () => {
  it("returns the same date for a Monday", () => {
    // 2026-04-13 is a Monday.
    expect(mondayOf("2026-04-13")).toBe("2026-04-13");
  });

  it("walks back to the Monday for a Wednesday", () => {
    // 2026-04-15 is Wed.
    expect(mondayOf("2026-04-15")).toBe("2026-04-13");
  });

  it("walks back 6 days for a Sunday (Sunday ends last week)", () => {
    // 2026-04-19 is a Sunday → prev Monday is 2026-04-13.
    expect(mondayOf("2026-04-19")).toBe("2026-04-13");
  });
});

// -----------------------------------------------------------------------------
// weeklyVolumeByGroup
// -----------------------------------------------------------------------------

describe("weeklyVolumeByGroup", () => {
  const bench = exercise({
    id: "bench_press",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front_delts"],
  });
  const pullup = exercise({
    id: "pullup",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps"],
    bodyweight: true,
  });

  it("groups sessions by Monday, collapsing back + lats into one group", () => {
    const sessions = [
      // Both in week-of-Mon 2026-04-13.
      session({
        date: "2026-04-13",
        exercises: [
          { name: "bench_press", sets: [{ reps: 5, weightKg: 100 }] },
        ],
      }),
      session({
        date: "2026-04-15",
        exercises: [
          { name: "pullup", sets: [{ reps: 8, weightKg: 0 }] },
        ],
      }),
    ];
    const rows = weeklyVolumeByGroup(sessions, [bench, pullup]);
    expect(rows).toHaveLength(1);
    expect(rows[0].weekStart).toBe("2026-04-13");
    // bench: chest+1, triceps+0.5, front_delts+0.5
    // pullup: lats+1, biceps+0.5 — lats rolls into "back" group.
    expect(rows[0].groups.chest).toBeCloseTo(1);
    expect(rows[0].groups.triceps).toBeCloseTo(0.5);
    expect(rows[0].groups.back).toBeCloseTo(1); // lats lands here
    expect(rows[0].groups.biceps).toBeCloseTo(0.5);
  });

  it("emits one row per week with sessions; skips empty weeks", () => {
    const sessions = [
      session({
        date: "2026-04-06",
        exercises: [{ name: "bench_press", sets: [{ reps: 5, weightKg: 100 }] }],
      }),
      session({
        date: "2026-04-20",
        exercises: [{ name: "bench_press", sets: [{ reps: 5, weightKg: 100 }] }],
      }),
    ];
    const rows = weeklyVolumeByGroup(sessions, [bench]);
    // Skipped week of 2026-04-13 should not appear.
    expect(rows.map((r) => r.weekStart)).toEqual(["2026-04-06", "2026-04-20"]);
  });

  it("empty input yields empty output", () => {
    expect(weeklyVolumeByGroup([], [])).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// oneRepMaxSeriesByLift
// -----------------------------------------------------------------------------

describe("oneRepMaxSeriesByLift", () => {
  const bench = exercise({ id: "bench_press", displayName: "Barbell Bench Press" });
  const pullup = exercise({ id: "pullup", bodyweight: true });
  const squat = exercise({ id: "squat", displayName: "Back Squat" });

  it("takes the best Epley across a session's sets", () => {
    const sessions = [
      session({
        date: "2026-04-13",
        exercises: [
          {
            name: "bench_press",
            sets: [
              { reps: 8, weightKg: 80 }, // 80 * (1+8/30) = 101.33
              { reps: 3, weightKg: 100 }, // 100 * (1+3/30) = 110
              { reps: 5, weightKg: 90 },  // 90 * (1+5/30) = 105
            ],
          },
        ],
      }),
    ];
    const series = oneRepMaxSeriesByLift(sessions, [bench]);
    expect(series).toHaveLength(1);
    expect(series[0].displayName).toBe("Barbell Bench Press");
    expect(series[0].points[0].value).toBeCloseTo(110, 3);
  });

  it("emits one series per lift, sorted by number of data points desc", () => {
    const sessions = [
      session({
        date: "2026-04-01",
        exercises: [{ name: "bench_press", sets: [{ reps: 5, weightKg: 100 }] }],
      }),
      session({
        date: "2026-04-03",
        exercises: [
          { name: "bench_press", sets: [{ reps: 5, weightKg: 100 }] },
          { name: "squat", sets: [{ reps: 5, weightKg: 120 }] },
        ],
      }),
    ];
    const series = oneRepMaxSeriesByLift(sessions, [bench, squat]);
    expect(series.map((s) => s.exerciseId)).toEqual(["bench_press", "squat"]);
    expect(series[0].points).toHaveLength(2);
    expect(series[1].points).toHaveLength(1);
  });

  it("skips bodyweight exercises", () => {
    const sessions = [
      session({
        date: "2026-04-13",
        exercises: [{ name: "pullup", sets: [{ reps: 8, weightKg: 0 }] }],
      }),
    ];
    expect(oneRepMaxSeriesByLift(sessions, [pullup])).toEqual([]);
  });

  it("silently skips sessions that reference unknown exercise ids", () => {
    const sessions = [
      session({
        date: "2026-04-13",
        exercises: [{ name: "something_deleted", sets: [{ reps: 5, weightKg: 80 }] }],
      }),
    ];
    expect(oneRepMaxSeriesByLift(sessions, [bench])).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// streakRibbon
// -----------------------------------------------------------------------------

describe("streakRibbon", () => {
  function loa(start: string, end: string): LoAFile {
    return { start, end, reason: "", notes: "" };
  }

  it("returns `days` entries ending at today (inclusive)", () => {
    const ribbon = streakRibbon([], [], "2026-04-19", 7);
    expect(ribbon).toHaveLength(7);
    expect(ribbon[0].date).toBe("2026-04-13");
    expect(ribbon[6].date).toBe("2026-04-19");
    // No sessions, no LoAs → all rest.
    expect(ribbon.every((d) => d.state === "rest")).toBe(true);
  });

  it("flags days with a training session as trained", () => {
    const sessions = [session({ date: "2026-04-17" })];
    const ribbon = streakRibbon(sessions, [], "2026-04-19", 5);
    // 2026-04-15..04-19 window.
    const statuses = ribbon.map((d) => d.state);
    expect(statuses).toEqual(["rest", "rest", "trained", "rest", "rest"]);
  });

  it("flags cardio-week sessions separately from normal training", () => {
    const sessions = [
      session({ date: "2026-04-18", isCardioWeek: true }),
    ];
    const ribbon = streakRibbon(sessions, [], "2026-04-19", 3);
    expect(ribbon.map((d) => d.state)).toEqual(["rest", "cardio", "rest"]);
  });

  it("LoA wins over everything", () => {
    const sessions = [session({ date: "2026-04-18" })];
    const loas = [loa("2026-04-17", "2026-04-19")];
    const ribbon = streakRibbon(sessions, loas, "2026-04-19", 3);
    expect(ribbon.map((d) => d.state)).toEqual(["loa", "loa", "loa"]);
  });
});
