// Seeding tests — verify idempotency, that the full payload lands, and that
// the three planned days come out of the vault in the prescribed order.

import { describe, it, expect } from "vitest";
import {
  InMemoryVaultAdapter,
  loadAllExercises,
  loadCompanionQuotes,
  loadQuotes,
  loadVolumeLandmarks,
  VOLUME_LANDMARKS_PATH,
} from "./vault";
import { SEED_COMPANION_QUOTES } from "../seed/companionQuotes";
import { DEFAULT_LANDMARKS } from "./landmarks";
import { seedVault, applyShippedPlan } from "./seed";
import { SEED_EXERCISES } from "../seed/exercises";
import { parseExerciseFile } from "./frontmatter";
import { saveSession, loadAllSessions } from "./vault";
import {
  SEED_PRO_EMPEROR_QUOTES,
  SEED_DISAVOWAL_QUOTES,
} from "../seed/quotes";
import { SEED_BASE_FILES } from "../seed/bases";
import { MUSCLE_TO_GROUP } from "./landmarks";

describe("seedVault — first run", () => {
  it("writes all 41 exercises and both quote files", async () => {
    const adapter = new InMemoryVaultAdapter();
    const report = await seedVault(adapter);

    expect(report.exercisesCreated).toBe(SEED_EXERCISES.length);
    expect(report.exercisesSkipped).toBe(0);
    // Three quote files: pro_emperor.json, disavowal.json, companion.json.
    expect(report.quotesCreated).toBe(3);
    expect(report.quotesSkipped).toBe(0);
    expect(report.landmarksCreated).toBe(1);
    expect(report.landmarksSkipped).toBe(0);
    expect(report.basesCreated).toBe(SEED_BASE_FILES.length);
    expect(report.basesSkipped).toBe(0);

    const loaded = await loadAllExercises(adapter);
    expect(loaded).toHaveLength(SEED_EXERCISES.length);

    expect(await loadQuotes(adapter, "pro_emperor")).toEqual(
      SEED_PRO_EMPEROR_QUOTES,
    );
    expect(await loadQuotes(adapter, "disavowal")).toEqual(
      SEED_DISAVOWAL_QUOTES,
    );

    // Landmarks file was written with the in-code defaults.
    expect(await loadVolumeLandmarks(adapter)).toEqual(DEFAULT_LANDMARKS);
  });

  it("seeds exactly 25 pro-Emperor and 25 disavowal quotes", () => {
    expect(SEED_PRO_EMPEROR_QUOTES).toHaveLength(25);
    expect(SEED_DISAVOWAL_QUOTES).toHaveLength(25);
  });
});

describe("seedVault — idempotency", () => {
  it("leaves existing files alone on a second run", async () => {
    const adapter = new InMemoryVaultAdapter();
    await seedVault(adapter);

    // Simulate the user editing their bench_press definition, their quotes,
    // and their landmarks.
    await adapter.writeFile(
      "exercises/bench_press.md",
      "---\nid: bench_press\ndisplay_name: CUSTOMIZED\n---\n",
    );
    await adapter.writeFile("quotes/pro_emperor.json", JSON.stringify(["one"]));
    await adapter.writeFile(
      VOLUME_LANDMARKS_PATH,
      "---\nchest:\n  mev: 99\n  mav: 100\n  mrv: 101\n---\n",
    );

    const report = await seedVault(adapter);
    expect(report.exercisesCreated).toBe(0);
    expect(report.exercisesSkipped).toBe(SEED_EXERCISES.length);
    expect(report.quotesCreated).toBe(0);
    expect(report.quotesSkipped).toBe(3);
    expect(report.landmarksCreated).toBe(0);
    expect(report.landmarksSkipped).toBe(1);
    // Second run also leaves Base files alone (idempotent without the
    // overwriteBases flag).
    expect(report.basesCreated).toBe(0);
    expect(report.basesSkipped).toBe(SEED_BASE_FILES.length);

    // User's custom values are preserved.
    const raw = await adapter.readFile("exercises/bench_press.md");
    expect(raw).toContain("CUSTOMIZED");
    expect(await loadQuotes(adapter, "pro_emperor")).toEqual(["one"]);
    expect((await loadVolumeLandmarks(adapter)).chest).toEqual({
      mev: 99,
      mav: 100,
      mrv: 101,
    });
  });

  it("overwriteBases flag rewrites every base file, touching nothing else", async () => {
    const adapter = new InMemoryVaultAdapter();
    await seedVault(adapter);

    // User manually mangles a Base file. Regenerate should put it right.
    const firstBase = `bases/${SEED_BASE_FILES[0].filename}`;
    await adapter.writeFile(firstBase, "BROKEN");

    const report = await seedVault(adapter, { overwriteBases: true });
    // Every Base file is rewritten (count equals the seed list length).
    expect(report.basesCreated).toBe(SEED_BASE_FILES.length);
    expect(report.basesSkipped).toBe(0);
    // Exercises / quotes / landmarks remain idempotent — unchanged from
    // the first seed run.
    expect(report.exercisesCreated).toBe(0);
    expect(report.quotesCreated).toBe(0);
    expect(report.landmarksCreated).toBe(0);

    // Contents are the shipped canonical copy, not the user's garbage.
    const raw = await adapter.readFile(firstBase);
    expect(raw).toBe(SEED_BASE_FILES[0].contents);
  });
});

describe("seedVault — companion quote backfill", () => {
  const COMPANION_PATH = "quotes/companion.json";

  it("adds pools the existing file is missing, preserving the user's edits", async () => {
    const adapter = new InMemoryVaultAdapter();
    await seedVault(adapter);

    // Simulate a vault seeded before three/five-session week existed: the
    // old keys are present (one of them user-edited), the new ones absent.
    await adapter.writeFile(
      COMPANION_PATH,
      JSON.stringify({
        workout_complete: [{ text: "MY OWN LINE", character: "Malte" }],
        ten_sets_muscle: [],
        fifteen_sets_muscle: [],
        two_hour_cardio: [],
        rare_companion: [],
      }),
    );

    const report = await seedVault(adapter);
    expect(report.quotePoolsBackfilled).toBe(1);

    const migrated = await loadCompanionQuotes(adapter);
    // New pools arrived, fully populated from the shipped seed.
    expect(migrated.three_session_week).toEqual(
      SEED_COMPANION_QUOTES.three_session_week,
    );
    expect(migrated.five_session_week).toEqual(
      SEED_COMPANION_QUOTES.five_session_week,
    );
    // The user's own line survived, and a pool they emptied stayed empty.
    expect(migrated.workout_complete).toEqual([
      { text: "MY OWN LINE", character: "Malte" },
    ]);
    expect(migrated.ten_sets_muscle).toEqual([]);
  });

  it("is a no-op once every pool is present", async () => {
    const adapter = new InMemoryVaultAdapter();
    await seedVault(adapter);
    const report = await seedVault(adapter);
    expect(report.quotePoolsBackfilled).toBe(0);
  });

  it("leaves an unparseable file alone rather than clobbering it", async () => {
    const adapter = new InMemoryVaultAdapter();
    await seedVault(adapter);
    await adapter.writeFile(COMPANION_PATH, "{ not json at all");

    const report = await seedVault(adapter);
    expect(report.quotePoolsBackfilled).toBe(0);
    expect(await adapter.readFile(COMPANION_PATH)).toBe("{ not json at all");
  });
});

// ---------------------------------------------------------------------------
// The planned split
// ---------------------------------------------------------------------------
//
// These pin the exact contents and running order of each day. They're
// intentionally brittle: the whole point of `order` is that the Ritual menu
// reads as the workout, so a silent reshuffle should fail loudly here.

describe("the seeded plan", () => {
  async function library() {
    const adapter = new InMemoryVaultAdapter();
    await seedVault(adapter);
    return loadAllExercises(adapter);
  }
  async function day(slot: "bench" | "deadlift" | "press") {
    return (await library()).filter((e) => e.rotationSlots.includes(slot));
  }

  // One barbell anchor per day and nothing else. Accessories are reached
  // through the deficit picker, which is exactly why they carry no slot:
  // nobody has to decide in advance which day a lateral raise belongs to.
  it("gives each day exactly one anchor", async () => {
    expect((await day("bench")).map((e) => e.displayName)).toEqual([
      "Barbell Bench Press",
    ]);
    expect((await day("deadlift")).map((e) => e.displayName)).toEqual([
      "Deadlift",
    ]);
    expect((await day("press")).map((e) => e.displayName)).toEqual([
      "Standing Overhead Press",
    ]);
  });

  it("prescribes four sets for everything", async () => {
    const odd = (await library()).filter((e) => e.targetSets !== 4);
    expect(odd.map((e) => e.id)).toEqual([]);
  });

  it("leaves every non-anchor lift slotless", async () => {
    const slotted = (await library())
      .filter((e) => e.rotationSlots.length > 0)
      .map((e) => e.id)
      .sort();
    expect(slotted).toEqual(["bench_press", "deadlift", "overhead_press"]);
  });

  it("drops the movements removed on request", async () => {
    const ids = new Set((await library()).map((e) => e.id));
    for (const gone of [
      "pallof_press",
      "hanging_leg_raise",
      "plank",
      "russian_twist",
      "bulgarian_split_squat",
      "front_squat",
      "barbell_shrug",
      "kettlebell_swing",
    ]) {
      expect(ids.has(gone), `${gone} should be gone`).toBe(false);
    }
  });

  it("keeps every lift that carries logged sets", async () => {
    // These were dropped from a DAY, not from the library. Their history
    // still has to resolve or the Sanctum silently loses that volume.
    const ids = new Set((await library()).map((e) => e.id));
    for (const kept of [
      "dips",
      "tricep_pushdown",
      "db_wrist_curl",
      "seated_row",
      "bent_over_db_row",
      "lat_pulldown",
      "face_pull",
      "cable_curl",
      "pullup",
      "lateral_raise",
      "leg_press",
      "leg_curl",
      "leg_extension",
      "chinup",
      "barbell_row",
      "seated_curl",
      "rear_delt_fly",
      "incline_db_press",
    ]) {
      expect(ids.has(kept), `${kept} should still be seeded`).toBe(true);
    }
  });

  // The picker is useless for a group with nothing to offer. Every group
  // the landmarks know about needs at least one primary-mover remedy.
  it("gives every muscle group at least one primary-mover option", async () => {
    const lib = await library();
    const covered = new Set<string>();
    for (const e of lib)
      for (const mu of e.primaryMuscles) covered.add(MUSCLE_TO_GROUP[mu]);
    const uncovered = Object.keys(DEFAULT_LANDMARKS).filter(
      (g) => !covered.has(g),
    );
    expect(uncovered).toEqual([]);
  });

  it("no longer relies on a single lift for the lower back", async () => {
    const lib = await library();
    const lowerBack = lib.filter((e) =>
      e.primaryMuscles.some((mu) => MUSCLE_TO_GROUP[mu] === "lower_back"),
    );
    // Was just the deadlift, which is unreachable as an accessory on the
    // two days it does not anchor.
    expect(lowerBack.length).toBeGreaterThan(1);
  });

  it("has no kettlebell movements left", async () => {
    const lib = await library();
    expect(lib.filter((e) => e.equipment === "kettlebell")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// applyShippedPlan
// ---------------------------------------------------------------------------
//
// The programme ships inside the plugin; the exercise FILES are vault notes.
// When plugin code updates but note sync does not, the Ritual serves an old
// workout. This is the reconciliation, and the thing it must never do is
// cost the user a logged set.
//
// NL comes from fromCharCode rather than an escape: escape sequences in this
// repo have been mangled by tooling more than once, and a silently broken
// test file is worse than a slightly verbose one.

const NL = String.fromCharCode(10);

describe("applyShippedPlan", () => {
  it("rewrites a stale definition to match the shipped plan", async () => {
    const adapter = new InMemoryVaultAdapter();
    await seedVault(adapter);

    // A definition left behind by an older release: wrong day, wrong set
    // target, wrong order, wrong muscles.
    await adapter.writeFile(
      "exercises/bench_press.md",
      [
        "---",
        "id: bench_press",
        "display_name: Bench Press",
        "primary_muscles:",
        "  - triceps",
        "secondary_muscles: []",
        "rotation_slots:",
        "  - deadlift",
        "order: 99",
        "target_sets: 2",
        "equipment: barbell",
        "progression: double",
        "bodyweight: false",
        "---",
        "",
      ].join(NL),
    );

    const report = await applyShippedPlan(adapter);
    expect(report.updated).toBeGreaterThan(0);

    const shipped = SEED_EXERCISES.find((e) => e.id === "bench_press")!;
    const onDisk = parseExerciseFile(
      await adapter.readFile("exercises/bench_press.md"),
    );
    expect(onDisk.rotationSlots).toEqual(shipped.rotationSlots);
    expect(onDisk.targetSets).toBe(shipped.targetSets);
    expect(onDisk.order).toBe(shipped.order);
    expect(onDisk.primaryMuscles).toEqual(shipped.primaryMuscles);
    expect(onDisk.displayName).toBe(shipped.displayName);
  });

  it("is a no-op on a vault already matching the plan", async () => {
    const adapter = new InMemoryVaultAdapter();
    await seedVault(adapter);
    const report = await applyShippedPlan(adapter);
    expect(report.updated).toBe(0);
    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(SEED_EXERCISES.length);
  });

  it("preserves a note the user wrote under the frontmatter", async () => {
    const adapter = new InMemoryVaultAdapter();
    await seedVault(adapter);
    const raw = await adapter.readFile("exercises/deadlift.md");
    const note = "Mind the lower back on the third set.";
    await adapter.writeFile(
      "exercises/deadlift.md",
      raw.trimEnd() + NL + note + NL,
    );

    await applyShippedPlan(adapter);
    expect(await adapter.readFile("exercises/deadlift.md")).toContain(note);
  });

  it("leaves logged sessions untouched", async () => {
    const adapter = new InMemoryVaultAdapter();
    await seedVault(adapter);
    await saveSession(adapter, {
      date: "2026-09-01",
      rotationPosition: 0,
      rotationSlot: "bench",
      isCardioWeek: false,
      sleepHours: 8,
      bodyweightKg: 80,
      cardioMinutes: null,
      cardioType: null,
      cleanseType: null,
      // Deliberately a lift that is NOT on the current plan: its history has
      // to survive the reshuffle that dropped it.
      exercises: [
        { name: "tricep_pushdown", sets: [{ reps: 8, weightKg: 30 }] },
      ],
      notes: "",
    });

    await applyShippedPlan(adapter);

    const [session] = await loadAllSessions(adapter);
    expect(session.exercises[0].name).toBe("tricep_pushdown");
    expect(session.exercises[0].sets).toEqual([{ reps: 8, weightKg: 30 }]);
    // The definition it points at still exists, so volume still credits it.
    expect(await adapter.exists("exercises/tricep_pushdown.md")).toBe(true);
  });
});
