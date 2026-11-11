// Tests for the accessory picker's ranking engine.
//
// Three design decisions carry the whole feature, and each is the kind of
// thing a later edit could quietly undo. They get a test apiece.

import { describe, it, expect } from "vitest";
import {
  rankGroupDeficits,
  remediesFor,
  isDeloadDay,
  suggestibleDeficits,
  SUGGESTION_EXCLUDED_GROUPS,
} from "./deficits";
import { DEFAULT_LANDMARKS } from "./landmarks";
import type { ExerciseFile, SessionFile } from "./schemas";


function ex(
  id: string,
  primary: ExerciseFile["primaryMuscles"],
  secondary: ExerciseFile["secondaryMuscles"] = [],
): ExerciseFile {
  return {
    id,
    displayName: id,
    primaryMuscles: primary,
    secondaryMuscles: secondary,
    rotationSlots: [],
    order: 1,
    targetSets: 4,
    equipment: "barbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  };
}

function session(
  date: string,
  exercises: SessionFile["exercises"],
  isCardioWeek = false,
): SessionFile {
  return {
    date,
    rotationPosition: isCardioWeek ? null : 0,
    rotationSlot: isCardioWeek ? "cardio" : "bench",
    isCardioWeek,
    sleepHours: null,
    bodyweightKg: 80,
    cardioMinutes: null,
    cardioType: null,
    cleanseType: null,
    exercises,
    notes: "",
  };
}

const sets = (n: number) =>
  Array.from({ length: n }, () => ({ reps: 8, weightKg: 50 }));

describe("rankGroupDeficits", () => {
  it("measures the gap to MAV, not to MEV", () => {
    // Chest MEV 8, MAV 14. Ten sets clears the floor but is still four
    // short of where growth happens, and the picker has to keep offering
    // it — a board that went quiet at MEV would steer toward maintenance.
    const exercises = [ex("bench", ["chest"])];
    const sessions = [session("2026-11-09", [{ name: "bench", sets: sets(10) }])];
    const board = rankGroupDeficits(
      sessions,
      exercises,
      DEFAULT_LANDMARKS,
      "2026-11-09",
    );
    const chest = board.find((d) => d.group === "chest")!;
    expect(chest.weeklySets).toBe(10);
    expect(chest.underMev).toBe(false);
    expect(chest.toMav).toBe(4);
  });

  it("drops a group off the board once it reaches MAV", () => {
    const exercises = [ex("bench", ["chest"])];
    const sessions = [session("2026-11-09", [{ name: "bench", sets: sets(14) }])];
    const board = rankGroupDeficits(
      sessions,
      exercises,
      DEFAULT_LANDMARKS,
      "2026-11-09",
    );
    expect(board.find((d) => d.group === "chest")!.toMav).toBe(0);
  });

  it("ranks the largest debt first", () => {
    const exercises = [ex("bench", ["chest"]), ex("curl", ["biceps"])];
    const sessions = [
      session("2026-11-09", [
        { name: "bench", sets: sets(12) },
        { name: "curl", sets: sets(2) },
      ]),
    ];
    const board = rankGroupDeficits(
      sessions,
      exercises,
      DEFAULT_LANDMARKS,
      "2026-11-09",
    );
    const chest = board.findIndex((d) => d.group === "chest");
    const biceps = board.findIndex((d) => d.group === "biceps");
    // Biceps owes 12 of 14, chest owes 2 of 14, so biceps sorts higher.
    expect(biceps).toBeLessThan(chest);
  });

  it("counts secondary movers toward the deficit at half weight", () => {
    // Bench credits triceps 0.5x. Eight sets of bench is four tricep sets,
    // leaving eight short of the MAV of 12.
    const exercises = [ex("bench", ["chest"], ["triceps"])];
    const sessions = [session("2026-11-09", [{ name: "bench", sets: sets(8) }])];
    const board = rankGroupDeficits(
      sessions,
      exercises,
      DEFAULT_LANDMARKS,
      "2026-11-09",
    );
    expect(board.find((d) => d.group === "triceps")!.weeklySets).toBe(4);
  });

  // The deload rule. Without it, a week of prescribed rest would read as a
  // week of failure and open the next session with every group screaming.
  it("does not let a deload week inflate the deficits", () => {
    const exercises = [ex("bench", ["chest"])];
    const trained = session("2026-11-02", [{ name: "bench", sets: sets(14) }]);
    const deload = [
      session("2026-11-04", [], true),
      session("2026-11-06", [], true),
    ];

    // Measured on the day of the last real session: chest is at MAV.
    const before = rankGroupDeficits(
      [trained],
      exercises,
      DEFAULT_LANDMARKS,
      "2026-11-02",
    );
    expect(before.find((d) => d.group === "chest")!.toMav).toBe(0);

    // A week later, through a deload, that session is still the most recent
    // seven TRAINING days, so the figure holds.
    const during = rankGroupDeficits(
      [trained, ...deload],
      exercises,
      DEFAULT_LANDMARKS,
      "2026-11-09",
    );
    expect(during.find((d) => d.group === "chest")!.toMav).toBe(0);
  });

  it("reports every group the landmarks know about, trained or not", () => {
    const board = rankGroupDeficits([], [], DEFAULT_LANDMARKS, "2026-11-09");
    expect(board.length).toBe(Object.keys(DEFAULT_LANDMARKS).length);
    // With no history at all everything is maximally behind.
    expect(board.every((d) => d.underMev)).toBe(true);
  });
});

describe("remediesFor", () => {
  it("offers only primary movers", () => {
    // Bench touches triceps, but prescribing bench to fix a tricep deficit
    // answers "what involves this muscle" when the question is "what trains
    // it". Only the pushdown qualifies.
    const exercises = [
      ex("bench", ["chest"], ["triceps"]),
      ex("pushdown", ["triceps"]),
    ];
    expect(remediesFor("triceps", exercises).map((e) => e.id)).toEqual([
      "pushdown",
    ]);
  });

  it("returns nothing when the library cannot address a group", () => {
    expect(remediesFor("calves", [ex("bench", ["chest"])])).toEqual([]);
  });
});

describe("isDeloadDay", () => {
  it("is true inside a derived cardio week and false outside it", () => {
    const sessions = [session("2026-11-02", [], true)];
    expect(isDeloadDay(sessions, "2026-11-02")).toBe(true);
    expect(isDeloadDay(sessions, "2026-11-08")).toBe(true);
    expect(isDeloadDay(sessions, "2026-11-09")).toBe(false);
  });
});

describe("suggestibleDeficits", () => {
  // Calves and core are measured like everything else but never offered.
  // The distinction matters: excluding them from the RANKING would quietly
  // stop their sets counting, which is not what was asked for.
  it("keeps excluded groups in the ranking but out of the suggestions", () => {
    const board = rankGroupDeficits([], [], DEFAULT_LANDMARKS, "2026-11-10");
    const ranked = board.map((d) => d.group);
    expect(ranked).toContain("calves");
    expect(ranked).toContain("core");

    const offered = suggestibleDeficits(board).map((d) => d.group);
    expect(offered).not.toContain("calves");
    expect(offered).not.toContain("core");
    // Everything else behind MAV still comes through.
    expect(offered).toContain("chest");
  });

  it("still drops groups that have reached MAV", () => {
    const exercises = [ex("bench", ["chest"])];
    const sessions = [session("2026-11-10", [{ name: "bench", sets: sets(14) }])];
    const board = rankGroupDeficits(
      sessions,
      exercises,
      DEFAULT_LANDMARKS,
      "2026-11-10",
    );
    expect(suggestibleDeficits(board).map((d) => d.group)).not.toContain(
      "chest",
    );
  });

  it("excludes exactly the two groups named", () => {
    expect([...SUGGESTION_EXCLUDED_GROUPS].sort()).toEqual(["calves", "core"]);
  });
});
