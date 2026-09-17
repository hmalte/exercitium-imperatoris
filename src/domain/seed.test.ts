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
import { seedVault } from "./seed";
import { SEED_EXERCISES } from "../seed/exercises";
import {
  SEED_PRO_EMPEROR_QUOTES,
  SEED_DISAVOWAL_QUOTES,
} from "../seed/quotes";
import { SEED_BASE_FILES } from "../seed/bases";

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

  it("seeds exactly 50 pro-Emperor and 50 disavowal quotes", () => {
    expect(SEED_PRO_EMPEROR_QUOTES).toHaveLength(50);
    expect(SEED_DISAVOWAL_QUOTES).toHaveLength(50);
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

describe("the seeded push/pull/legs plan", () => {
  // Mirrors the Ritual's menu query: filter by slot, then take load order.
  async function day(slot: "push" | "pull" | "legs") {
    const adapter = new InMemoryVaultAdapter();
    await seedVault(adapter);
    const all = await loadAllExercises(adapter);
    return all.filter((e) => e.rotationSlots.includes(slot));
  }

  it("orders the push day as prescribed", async () => {
    const push = await day("push");
    expect(push.map((e) => e.displayName)).toEqual([
      "Bench Press",
      "Shoulder Press",
      "Dips (assisted)",
      "Lateral Raises",
      "Tricep Pushdown",
      "DB Wrist Curl & Extension",
    ]);
    expect(push.map((e) => e.targetSets)).toEqual([4, 4, 4, 4, 4, 3]);
  });

  it("orders the pull day as prescribed", async () => {
    const pull = await day("pull");
    expect(pull.map((e) => e.displayName)).toEqual([
      "Deadlift",
      "Seated Cable Row",
      "Bent-Over Dumbbell Row",
      "Lat Pulldown",
      "Face Pull / Reverse Pec Deck",
      "Bicep Curl (Cable)",
    ]);
    expect(pull.map((e) => e.targetSets)).toEqual([4, 3, 3, 3, 4, 3]);
  });

  it("orders the legs day as prescribed", async () => {
    const legs = await day("legs");
    // Shoulder Press opens leg day: it sits on both push and legs, and
    // `order` is one number per exercise, so its push position (2) places
    // it first here too.
    expect(legs.map((e) => e.displayName)).toEqual([
      "Shoulder Press",
      "Leg Press",
      "Leg Curl",
      "Leg Extension",
      "Sit-ups",
    ]);
    expect(legs.map((e) => e.targetSets)).toEqual([4, 3, 3, 3, 3]);
  });

  it("keeps retired lifts as files but off every planned day", async () => {
    const adapter = new InMemoryVaultAdapter();
    await seedVault(adapter);
    const all = await loadAllExercises(adapter);
    const byId = new Map(all.map((e) => [e.id, e]));

    for (const id of [
      "barbell_row",
      "incline_db_press",
      "front_squat",
      "standing_calf_raise",
      "cable_fly",
      // Came off leg day; history and volume credit must survive.
      "back_squat",
      "hanging_leg_raise",
      "pallof_press",
      // Came off pull day.
      "pullup",
      "seated_curl",
    ]) {
      const ex = byId.get(id);
      // The file still exists — history and volume credit are intact…
      expect(ex, `${id} should still be seeded`).toBeDefined();
      // …it just isn't offered on any day.
      expect(ex!.rotationSlots).toEqual([]);
    }
  });

  it("gives every planned lift a distinct position within its day", async () => {
    for (const slot of ["push", "pull", "legs"] as const) {
      const orders = (await day(slot)).map((e) => e.order);
      expect(new Set(orders).size, `${slot} has duplicate order values`).toBe(
        orders.length,
      );
    }
  });
});
