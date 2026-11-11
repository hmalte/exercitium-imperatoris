// Round-trip tests for the frontmatter parser/serializer.
//
// Strategy: build a TS object → serialize → parse → assert equal. If that
// holds for every file type, we know reads and writes match up and no data
// is silently lost or garbled.

import { describe, it, expect } from "vitest";
import {
  splitFrontmatter,
  joinFrontmatter,
  parseSessionFile,
  serializeSessionFile,
  parseExerciseFile,
  serializeExerciseFile,
  parseLoAFile,
  serializeLoAFile,
} from "./frontmatter";
import type { SessionFile, ExerciseFile, LoAFile } from "./schemas";
import { DEFAULT_EXERCISE_ORDER, DEFAULT_TARGET_SETS } from "./schemas";

describe("splitFrontmatter", () => {
  it("extracts yaml and body from a well-formed file", () => {
    const raw = "---\nkey: value\n---\nBody text.\n";
    const { data, body } = splitFrontmatter(raw);
    expect(data).toEqual({ key: "value" });
    // Trailing whitespace is stripped so round-trip is symmetric.
    expect(body).toBe("Body text.");
  });

  it("returns empty data when no frontmatter is present", () => {
    const raw = "Just a body, no frontmatter.";
    const { data, body } = splitFrontmatter(raw);
    expect(data).toEqual({});
    expect(body).toBe("Just a body, no frontmatter.");
  });

  it("handles Windows-style CRLF line endings", () => {
    const raw = "---\r\nkey: value\r\n---\r\nBody.\r\n";
    const { data, body } = splitFrontmatter(raw);
    expect(data).toEqual({ key: "value" });
    expect(body).toBe("Body.");
  });

  it("handles an empty body", () => {
    const raw = "---\nkey: value\n---\n";
    const { data, body } = splitFrontmatter(raw);
    expect(data).toEqual({ key: "value" });
    expect(body).toBe("");
  });
});

describe("joinFrontmatter", () => {
  it("builds a file with the expected shape", () => {
    const out = joinFrontmatter({ key: "value" }, "Body.");
    expect(out).toBe("---\nkey: value\n---\nBody.\n");
  });
});

describe("Session file round-trip", () => {
  it("preserves all fields through serialize → parse", () => {
    const original: SessionFile = {
      date: "2026-04-19",
      rotationPosition: 3,
      rotationSlot: "bench",
      isCardioWeek: false,
      sleepHours: 7.5,
      bodyweightKg: 72,
      cardioMinutes: 12,
      cardioType: "sprint",
      cleanseType: "sauna",
      exercises: [
        {
          name: "bench_press",
          sets: [
            { reps: 6, weightKg: 80, highEffort: false },
            { reps: 5, weightKg: 80, highEffort: false },
          ],
        },
        {
          name: "overhead_press",
          sets: [{ reps: 8, weightKg: 45, highEffort: false }],
        },
      ],
      notes: "Felt strong today.",
    };
    const raw = serializeSessionFile(original);
    const parsed = parseSessionFile(raw);
    expect(parsed).toEqual(original);
  });

  it("handles a cardio-week session (null rotation position)", () => {
    const original: SessionFile = {
      date: "2026-05-10",
      rotationPosition: null,
      rotationSlot: "cardio",
      isCardioWeek: true,
      sleepHours: 8,
      bodyweightKg: null,
      cardioMinutes: null,
      cardioType: null,
      cleanseType: null,
      exercises: [],
      notes: "",
    };
    const raw = serializeSessionFile(original);
    const parsed = parseSessionFile(raw);
    expect(parsed).toEqual(original);
  });

  // cleanse_type postdates the first sessions. A file written before the
  // cleanse step existed has no such key, and must still load — as "no
  // sauna recorded", which is the truth for those days.
  it("defaults cleanse_type when the frontmatter omits it", () => {
    const legacy = [
      "---",
      "date: '2026-04-19'",
      "rotation_position: 0",
      "rotation_slot: bench",
      "is_cardio_week: false",
      "sleep_hours: 8",
      "bodyweight_kg: 80",
      "cardio_minutes: null",
      "cardio_type: null",
      "exercises: []",
      "---",
      "",
    ].join(String.fromCharCode(10));
    const parsed = parseSessionFile(legacy);
    expect(parsed.cleanseType).toBeNull();
    expect(parsed.date).toBe("2026-04-19");
  });

  // Retired modalities degrade rather than blowing up the file.
  it("degrades a retired cardio_type to null", () => {
    const legacy = [
      "---",
      "date: '2026-04-19'",
      "rotation_slot: cardio",
      "cardio_type: landing_ship",
      "exercises: []",
      "---",
      "",
    ].join(String.fromCharCode(10));
    expect(parseSessionFile(legacy).cardioType).toBeNull();
  });

  // The effort flag has to survive a save/load cycle, and a session file
  // written before it existed has to keep loading.
  it("round-trips the high-effort flag", () => {
    const original: SessionFile = {
      date: "2026-11-11",
      rotationPosition: 0,
      rotationSlot: "bench",
      isCardioWeek: false,
      sleepHours: null,
      bodyweightKg: 80,
      cardioMinutes: null,
      cardioType: null,
      cleanseType: null,
      exercises: [
        {
          name: "bench_press",
          sets: [
            { reps: 5, weightKg: 70, highEffort: true },
            { reps: 8, weightKg: 50, highEffort: false },
          ],
        },
      ],
      notes: "",
    };
    const parsed = parseSessionFile(serializeSessionFile(original));
    expect(parsed.exercises[0].sets.map((s) => s.highEffort)).toEqual([
      true,
      false,
    ]);
  });

  it("reads a set logged before the flag existed as not marked", () => {
    const legacy = [
      "---",
      "date: '2026-09-01'",
      "rotation_slot: bench",
      "exercises:",
      "  - name: bench_press",
      "    sets:",
      "      - reps: 5",
      "        weight_kg: 70",
      "---",
      "",
    ].join(String.fromCharCode(10));
    const parsed = parseSessionFile(legacy);
    expect(parsed.exercises[0].sets[0].highEffort).toBe(false);
    expect(parsed.exercises[0].sets[0].reps).toBe(5);
  });
});

describe("Exercise file round-trip", () => {
  it("preserves all fields through serialize → parse", () => {
    const original: ExerciseFile = {
      id: "bench_press",
      displayName: "Bench Press",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps", "front_delts"],
      rotationSlots: ["bench"],
      order: 1,
      targetSets: 4,
      equipment: "barbell",
      progression: "double",
      bodyweight: false,
      notes: "Form cues: retract scapulae, touch lower chest.",
    };
    const raw = serializeExerciseFile(original);
    const parsed = parseExerciseFile(raw);
    expect(parsed).toEqual(original);
  });

  it("preserves a bodyweight exercise", () => {
    const original: ExerciseFile = {
      id: "pullup",
      displayName: "Pull-up",
      primaryMuscles: ["back", "lats"],
      secondaryMuscles: ["biceps"],
      rotationSlots: ["deadlift"],
      order: 3,
      targetSets: 4,
      equipment: "bodyweight",
      progression: "double",
      bodyweight: true,
      notes: "",
    };
    const raw = serializeExerciseFile(original);
    expect(parseExerciseFile(raw)).toEqual(original);
  });

  // `order` and `target_sets` were added after the first vaults shipped, so
  // a file written by an older version (or hand-authored without them) must
  // still parse. It sorts last and inherits the default prescription.
  it("defaults order and target_sets when the frontmatter omits them", () => {
    const legacy = [
      "---",
      "id: cable_fly",
      "display_name: Cable Fly",
      "primary_muscles:",
      "  - chest",
      "secondary_muscles: []",
      "rotation_slots:",
      "  - bench",
      "equipment: cable",
      "progression: double",
      "bodyweight: false",
      "---",
      "",
    ].join(String.fromCharCode(10));
    const parsed = parseExerciseFile(legacy);
    expect(parsed.order).toBe(DEFAULT_EXERCISE_ORDER);
    expect(parsed.targetSets).toBe(DEFAULT_TARGET_SETS);
    expect(parsed.id).toBe("cable_fly");
  });
});

describe("LoA file round-trip", () => {
  it("preserves all fields through serialize → parse", () => {
    const original: LoAFile = {
      start: "2026-04-10",
      end: "2026-04-15",
      reason: "vacation",
      notes: "Family trip.",
    };
    const raw = serializeLoAFile(original);
    const parsed = parseLoAFile(raw);
    expect(parsed).toEqual(original);
  });
});
