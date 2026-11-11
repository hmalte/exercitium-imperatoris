// Type definitions for everything stored on disk.
//
// The vault is the source of truth — these types describe what each markdown
// file's YAML frontmatter + body mean to the rest of the app. One file per
// record (one session, one exercise, one LoA), Obsidian-native so everything
// is queryable via Bases and editable by hand if the user ever wants to.
//
// Naming convention:
//   - On disk (YAML):   snake_case (matches Obsidian/user conventions, shows
//                       up in Base filters exactly as written).
//   - In TypeScript:    camelCase (idiomatic TS).
//   - Conversion happens in frontmatter.ts at the read/write boundary.

import type { ISODate } from "./timeLogic";

// -----------------------------------------------------------------------------
// Shared vocabulary
// -----------------------------------------------------------------------------
//
// These string-literal unions give us compile-time safety — typos become
// type errors, and the editor can autocomplete valid values. If we ever need
// to add a muscle or slot, we add it here and TypeScript will tell us every
// place that needs updating.

// The three days, each named for the barbell lift that anchors it.
//
// Renamed from push/pull/legs when the plan moved to one fixed compound plus
// deficit-chosen accessories: a day is no longer a movement pattern, it is a
// main lift and whatever your weakest muscle groups need that session.
//
// ONLY the three compounds carry a slot now. Every accessory is slotless and
// reaches the Ritual through the deficit picker instead, which is why the
// library can grow without anyone deciding which day a lift "belongs" to.
//
// Session files written before the rename still say push/pull/legs on disk.
// Nothing reads rotationSlot to compute anything — volume keys off exercise
// ids, the streak off dates, the rotation off rotationPosition — so those
// files stay valid history and simply carry their old label.
export const ROTATION_SLOTS = ["bench", "deadlift", "press"] as const;
export type RotationSlot = (typeof ROTATION_SLOTS)[number];

// Widened slot used only in the persisted rotation ORDER. A rotation preset
// may include a fixed cardio day (e.g. the 4-day Sanguinary Split ends with
// one), so the order array has to allow "cardio" alongside the strength
// slots. Exercise definitions still tag themselves with `RotationSlot` only
// — you never put a lift in a cardio day — which is why we keep the two
// types distinct instead of widening `RotationSlot` itself.
export type RotationOrderSlot = RotationSlot | "cardio";

export const MUSCLES = [
  "chest",
  "back",
  "lats",
  "lower_back",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "front_delts",
  "side_delts",
  "rear_delts",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "kettlebell";

export type Progression = "double" | "linear" | "none";

/** Fallback `order` for exercise files that predate the field. Deliberately
 *  large so unordered legacy/user-added lifts land at the bottom of the menu
 *  instead of silently jumping ahead of the planned order. */
export const DEFAULT_EXERCISE_ORDER = 999;

/** Fallback `target_sets` when a file doesn't specify one. */
export const DEFAULT_TARGET_SETS = 4;

// Cardio finisher types — thematic Imperial Gothic names for the modalities
// we want to offer:
//   march         → cooldown march / incline walk (leg-day default)
//   mechabike     → Zone 2 bike
//   climb         → stair climber / stepmill
//   landing_ship  → Zone 2 rower (the "strap in and row" motion of an
//                   Imperial landing ship's crew positions)
// null means no cardio was done (user skipped).
//
// Any legacy value on disk (e.g. old `zone2_rower` sessions) parses to null
// via cardioTypeOrNull in frontmatter.ts — nothing breaks, the old value
// just drops off.
// Two modalities, matching how cardio is actually done: a steady march or a
// hard sprint. Sessions written before this narrowing may carry retired
// values ("mechabike", "climb", "landing_ship"); parseSessionFile degrades
// anything unrecognised to null rather than rejecting the file.
export const CARDIO_TYPES = ["march", "sprint"] as const;
export type CardioType = (typeof CARDIO_TYPES)[number];

// -----------------------------------------------------------------------------
// Cleanse (sauna / steam)
// -----------------------------------------------------------------------------
//
// The post-workout finisher. Replaced the old cardio finisher, which went
// unused — cardio is now logged as its own session instead. Deliberately
// records only WHICH, not how long: the point is how often the flesh was
// cleansed, and asking for a number at the end of every workout is friction
// that gets a step skipped.

export const CLEANSE_TYPES = ["sauna", "steam"] as const;
export type CleanseType = (typeof CLEANSE_TYPES)[number];

// -----------------------------------------------------------------------------
// Session file
// -----------------------------------------------------------------------------
//
// One file per completed workout, stored under `sessions/YYYY-MM-DD.md`.
// The body of the file is freeform markdown — the user's notes.

export type SetEntry = {
  reps: number;
  weightKg: number;
  /**
   * Marked by the user as a high-effort set — taken at or near failure.
   *
   * Volume landmarks (MEV/MAV/MRV) are defined over hard sets, while the
   * app counts every logged set identically, so a loose set of fifteen
   * weighs the same as a grinding five. This flag is the raw material for
   * closing that gap.
   *
   * It does NOT yet change any number. Making effective volume count only
   * tagged sets would reinterpret every set logged before the flag existed
   * as not-hard, which would rewrite months of history by implication. The
   * flag records first; the maths can follow once there is enough of it to
   * mean something.
   */
  highEffort: boolean;
};

export type SessionExercise = {
  name: string; // matches an Exercise.id
  sets: SetEntry[];
};

export type SessionFile = {
  date: ISODate;
  rotationPosition: number | null; // null during cardio week
  /** Which kind of day this was. A rotation slot for planned training;
   *  "cardio" for a lung-only session; "freestyle" for a session picked
   *  from the whole library. The latter two carry a null rotationPosition,
   *  so neither advances the rotation. */
  rotationSlot: RotationSlot | "cardio" | "freestyle";
  isCardioWeek: boolean;
  sleepHours: number | null;
  /** User's bodyweight on this session, in kg. Optional, rolls forward
   *  from the most recent recorded value so the user only has to enter it
   *  when it changes. Used to estimate tonnage for bodyweight exercises. */
  bodyweightKg: number | null;
  /** Minutes of post-workout cardio finisher (the "lungs singing the
   *  Emperor's praise" step). Null if the user skipped it. */
  cardioMinutes: number | null;
  /** Modality of the cardio finisher — null if the user skipped. Lets the
   *  Codex later tell the story of which kind of cardio was done, and lets
   *  the next session's suggestion be smarter (e.g. default to rower
   *  again if the last upper day was a rower). */
  cardioType: CardioType | null;
  /** Sauna or steam taken after this workout, or null if skipped. Drives the
   *  Altar's cleanse tally. Absent from sessions written before the cleanse
   *  step existed, which parse as null. */
  cleanseType: CleanseType | null;
  exercises: SessionExercise[];
  notes: string;
};

// -----------------------------------------------------------------------------
// Exercise definition
// -----------------------------------------------------------------------------
//
// One file per movement, stored under `exercises/<id>.md`. The id is a stable
// snake_case slug (e.g. `bench_press`) — it's what session files reference.
// display_name is what the UI shows; rename it any time without touching data.

export type ExerciseFile = {
  id: string;
  displayName: string;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  rotationSlots: RotationSlot[];
  /** Position in the day's exercise menu. Lower sorts first; ties fall back
   *  to id so ordering stays deterministic. Exercises are meant to be done
   *  in this order, so the menu reads top-to-bottom as the workout plan.
   *  Defaults to DEFAULT_EXERCISE_ORDER for files written before this field
   *  existed — they sort after everything explicitly ordered. */
  order: number;
  /** How many sets the plan calls for. Displayed in the Ritual as a
   *  "n/target sets" counter; purely informational — logging more or fewer
   *  is never blocked. */
  targetSets: number;
  equipment: Equipment;
  progression: Progression;
  bodyweight: boolean;
  notes: string;
};

// -----------------------------------------------------------------------------
// Leave of Absence file
// -----------------------------------------------------------------------------
//
// One file per LoA, stored under `loas/<start>_to_<end>.md`. The body is
// freeform notes (why you were away, how you felt coming back, etc.).

export type LoAFile = {
  start: ISODate;
  end: ISODate;
  reason: string;
  notes: string;
};
