// Seed exercise definitions — the movement library written to the vault on
// first run.
//
// These are written to the vault on first run so the user has something to pick
// from. Once the files exist, this data is no longer consulted — the user's
// copies in the vault are the source of truth and can be edited freely.
//
// Conventions:
//   - primaryMuscles: muscles receiving direct training stimulus (1x volume credit)
//   - secondaryMuscles: muscles worked meaningfully but not the main target (0.5x credit)
//   - bodyweight: true means volume tracking can skip it (per project decision)
//   - progression: "double" = 3-8 rep double progression; "linear" = add weight
//     each session (heavy compounds); "none" = time/ holds that don't fit either.
//   - order: position within the day's menu. Numbered 1..N per rotation slot;
//     collisions across slots don't matter because the menu filters by slot
//     before sorting. Anything not on a planned day carries
//     DEFAULT_EXERCISE_ORDER so it sinks to the bottom if ever re-enabled.
//   - targetSets: sets the plan calls for. 4 on the delt/tricep/chest work,
//     3 on the heavy compounds and the leg/pulling machines.
//
// The plan: one barbell anchor per day, accessories chosen by deficit.
//
//   Bench day     → Barbell Bench Press
//   Deadlift day  → Deadlift
//   Press day     → Standing Overhead Press
//
// Those three are the only exercises carrying a rotation slot. Everything
// else is slotless library: the Ritual ranks muscle groups by how far they
// sit below MAV and offers the lifts that train each one as a PRIMARY
// mover, so accessory choice follows the actual volume debt instead of a
// list someone wrote months ago. Four sets throughout.
//
// This is why the library can grow freely. Adding a lift no longer means
// deciding which day it belongs to — it means declaring what it trains.
//
// Ids are stable across every rename this plan has been through, because a
// session references an exercise by id. Renaming a display name or dropping
// a lift from a day never costs logged sets.
//
// Deliberate gaps, stated rather than hidden:
//   - Core has exactly one movement (Sit-ups), by request. It is also not
//     loadable, so progression there is reps only and the deficit picker
//     will keep offering the same thing.
//   - There is no pulling anchor. Bench, deadlift and press are two presses
//     and a hinge, so lats and biceps will surface as deficits often. That
//     is the system working, not a hole — but it does mean back volume
//     depends on actually picking the accessories it offers.

import type { ExerciseFile } from "../domain/schemas";
import { DEFAULT_EXERCISE_ORDER } from "../domain/schemas";

// Set prescriptions. Isolation and delt/tricep work carries 4; the heavy
// compounds and the pulling/leg machines carry 3.
const SETS_4 = 4;

export const SEED_EXERCISES: ExerciseFile[] = [
  // ------------------------------------------------------------ Push (1..6)
  {
    id: "bench_press",
    displayName: "Barbell Bench Press",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front_delts"],
    rotationSlots: ["bench"],
    order: 1,
    targetSets: SETS_4,
    equipment: "barbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "overhead_press",
    displayName: "Standing Overhead Press",
    primaryMuscles: ["front_delts"],
    secondaryMuscles: ["triceps", "side_delts", "abs"],
    rotationSlots: ["press"],
    order: 1,
    targetSets: SETS_4,
    equipment: "barbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "dips",
    displayName: "Dips (assisted)",
    // Triceps promoted to primary: a dip drives full elbow extension under
    // load, so the triceps take direct stimulus, not incidental. Leaving
    // them at 0.5x credit under-counted every push day's tricep volume.
    primaryMuscles: ["chest", "triceps"],
    secondaryMuscles: ["front_delts"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "bodyweight",
    progression: "double",
    bodyweight: true,
    // Assisted: log the weight field as assistance if the machine shows it,
    // or leave it at 0 and let reps carry the progression.
    notes: "Assisted.",
  },
  {
    id: "lateral_raise",
    displayName: "Dumbbell Lateral Raise",
    primaryMuscles: ["side_delts"],
    secondaryMuscles: [],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "dumbbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "tricep_pushdown",
    displayName: "Tricep Pushdown",
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "cable",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "db_wrist_curl",
    displayName: "DB Wrist Curl & Extension",
    primaryMuscles: ["forearms"],
    secondaryMuscles: [],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "dumbbell",
    progression: "double",
    bodyweight: false,
    notes: "Curl and extension paired — log the combined set.",
  },

  // ------------------------------------------------------------ Pull (1..7)
  {
    id: "deadlift",
    displayName: "Deadlift",
    // Lower back promoted to primary: the erectors are what hold the spine
    // rigid against the load — the deadlift is the single largest source of
    // lower-back stimulus in this plan, and nothing else on push/pull/legs
    // trains them directly. At 0.5x it was the only lower-back credit the
    // week saw, which read as chronically under-MEV in the Sanctum.
    primaryMuscles: ["hamstrings", "glutes", "back", "lower_back"],
    secondaryMuscles: ["lats", "forearms", "quads"],
    rotationSlots: ["deadlift"],
    order: 1,
    targetSets: SETS_4,
    equipment: "barbell",
    progression: "linear",
    bodyweight: false,
    notes: "",
  },
  {
    id: "trap_bar_deadlift",
    displayName: "Trap Bar Deadlift",
    // Mapped deliberately differently from the straight-bar deadlift above.
    // The handles sit either side of the load, so the bar path runs through
    // the body rather than in front of it: the torso stays more upright,
    // the knees travel further, and the lift behaves like a loaded squat
    // with a deadlift's grip demand. Quads lead here where they are merely
    // secondary on the conventional pull, and the erectors drop to
    // secondary because they are holding a far shorter lever.
    //
    // That difference is the whole reason it gets its own entry rather than
    // sharing the deadlift's: pooled under one id, the Sanctum would credit
    // trap bar work to the lower back at full weight and under-credit the
    // quads, and the progression suggestion would compare two lifts whose
    // loads are nowhere near each other.
    primaryMuscles: ["quads", "glutes", "hamstrings"],
    secondaryMuscles: ["lower_back", "back", "forearms"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "barbell",
    // Heavy compound, so weight climbs session to session rather than
    // waiting for the rep range to top out.
    progression: "linear",
    bodyweight: false,
    notes: "",
  },
  {
    id: "seated_row",
    displayName: "Seated Cable Row",
    primaryMuscles: ["back"],
    secondaryMuscles: ["lats", "biceps", "rear_delts"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "cable",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "bent_over_db_row",
    displayName: "Bent-Over Dumbbell Row",
    primaryMuscles: ["back"],
    secondaryMuscles: ["lats", "biceps", "rear_delts"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "dumbbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "pullup",
    displayName: "Pull-ups (assisted)",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["back", "biceps"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "bodyweight",
    progression: "double",
    bodyweight: true,
    notes: "Assisted.",
  },
  {
    id: "lat_pulldown",
    displayName: "Lat Pulldown",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["back", "biceps"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "cable",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "face_pull",
    displayName: "Face Pull",
    primaryMuscles: ["rear_delts"],
    secondaryMuscles: ["back"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "cable",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "reverse_pec_deck",
    displayName: "Reverse Pec Deck",
    // Split out of face_pull. They were one entry on the reasoning that
    // pooled history beats two near-identical lifts — which was wrong: the
    // loads are nowhere near each other (face pulls logged at 45-60 lb, the
    // pec deck at 100-135), so a single entry made the progression read as
    // one lift tripling overnight. Same muscle, different machine, different
    // numbers; they need separate histories to be legible.
    primaryMuscles: ["rear_delts"],
    secondaryMuscles: ["back"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "machine",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "cable_curl",
    displayName: "Bicep Curl (Cable)",
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "cable",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "seated_curl",
    displayName: "Dumbbell Curls",
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "dumbbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },

  // ------------------------------------------------------------ Legs (1..6)
  {
    id: "back_squat",
    displayName: "Squat",
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes", "hamstrings", "lower_back"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "barbell",
    progression: "linear",
    bodyweight: false,
    notes: "",
  },
  {
    id: "leg_press",
    displayName: "Leg Press (Feet High)",
    primaryMuscles: ["glutes", "quads"],
    secondaryMuscles: ["hamstrings"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "machine",
    progression: "double",
    bodyweight: false,
    notes: "Feet high on the platform.",
  },
  {
    id: "leg_curl",
    displayName: "Leg Curl",
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: [],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "machine",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "leg_extension",
    displayName: "Leg Extension",
    primaryMuscles: ["quads"],
    secondaryMuscles: [],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "machine",
    progression: "double",
    bodyweight: false,
    notes: "",
  },

  {
    id: "situps",
    displayName: "Sit-ups",
    primaryMuscles: ["abs"],
    secondaryMuscles: ["obliques"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "bodyweight",
    progression: "double",
    bodyweight: true,
    notes: "",
  },

  {
    id: "pec_fly_machine",
    displayName: "Pec Fly Machine",
    // Distinct from the existing cable_fly: fixed path, seated, and it
    // isolates harder because the machine takes the stabilising work.
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "machine",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "cable_lateral_raise",
    displayName: "Cable Lateral Raise",
    // Constant tension through the whole arc, unlike the dumbbell version
    // where the bottom third is nearly free.
    primaryMuscles: ["side_delts"],
    secondaryMuscles: [],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "cable",
    progression: "double",
    bodyweight: false,
    notes: "",
  },

  {
    id: "back_extension",
    displayName: "Back Extension",
    primaryMuscles: ["lower_back"],
    secondaryMuscles: ["glutes", "hamstrings"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "bodyweight",
    progression: "double",
    bodyweight: true,
    notes: "",
  },
  {
    id: "reverse_hyper",
    displayName: "Reverse Hyperextension",
    primaryMuscles: ["lower_back"],
    secondaryMuscles: ["glutes"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "machine",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "reverse_curl",
    displayName: "Reverse Curl",
    primaryMuscles: ["forearms"],
    secondaryMuscles: ["biceps"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "barbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "single_leg_calf_raise",
    displayName: "Single-Leg Calf Raise",
    primaryMuscles: ["calves"],
    secondaryMuscles: [],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "dumbbell",
    progression: "double",
    bodyweight: false,
    notes: "Hold a dumbbell; log the load, not bodyweight.",
  },
  {
    id: "machine_lateral_raise",
    displayName: "Machine Lateral Raise",
    primaryMuscles: ["side_delts"],
    secondaryMuscles: [],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "machine",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "cable_rear_delt_fly",
    displayName: "Cable Rear Delt Fly",
    primaryMuscles: ["rear_delts"],
    secondaryMuscles: ["back"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "cable",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "machine_chest_press",
    displayName: "Machine Chest Press",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts", "triceps"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "machine",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  // ----------------------------------------------------- Off-plan: no slot
  //
  // These carried `upper` or `lower` before the rotation narrowed to three
  // days. They keep their definitions (and every set ever logged against
  // them) and are reachable from "Other exercise" during any workout.
  {
    id: "rear_delt_fly",
    displayName: "Dumbbell Rear Delt Fly",
    primaryMuscles: ["rear_delts"],
    secondaryMuscles: ["back"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "dumbbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "incline_curl",
    displayName: "Incline Dumbbell Curl",
    primaryMuscles: ["biceps"],
    secondaryMuscles: [],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "dumbbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "preacher_curl",
    displayName: "Preacher Curl",
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "barbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "overhead_tricep_extension",
    displayName: "Overhead Tricep Extension",
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "dumbbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "skull_crusher",
    displayName: "Skull Crusher",
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "barbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "arnold_press",
    displayName: "Arnold Press",
    primaryMuscles: ["front_delts"],
    secondaryMuscles: ["side_delts", "triceps"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "dumbbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "rdl",
    displayName: "Romanian Deadlift",
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["glutes", "lower_back"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "barbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "hip_thrust",
    displayName: "Hip Thrust",
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "barbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "good_morning",
    displayName: "Good Morning",
    primaryMuscles: ["hamstrings", "lower_back"],
    secondaryMuscles: ["lower_back", "glutes"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "barbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "single_leg_rdl",
    displayName: "Single-Leg RDL",
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["glutes", "lower_back"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "dumbbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },

  // ------------------------------------------------------------- Off-plan
  //
  // No rotation slot: these never appear in the Ritual menu, but the files
  // (and every set ever logged against them) stay intact. Add a slot back to
  // the vault file to bring one out of retirement.
  {
    id: "incline_db_press",
    displayName: "Incline Dumbbell Press",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts", "triceps"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "dumbbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "seated_db_press",
    displayName: "Seated Dumbbell Shoulder Press",
    primaryMuscles: ["front_delts"],
    secondaryMuscles: ["side_delts", "triceps"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "dumbbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "pushups",
    displayName: "Push-ups",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front_delts"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "bodyweight",
    progression: "double",
    bodyweight: true,
    notes: "",
  },
  {
    id: "close_grip_bench",
    displayName: "Close-Grip Bench Press",
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["chest", "front_delts"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "barbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "cable_fly",
    displayName: "Cable Fly",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "cable",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "chinup",
    displayName: "Chin-ups",
    // Supinated grip, so the biceps are a prime mover rather than an
    // accessory. That is the whole difference from the pull-up, which keeps
    // its own file and its own logged history.
    primaryMuscles: ["lats", "biceps"],
    secondaryMuscles: ["back", "forearms"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "bodyweight",
    progression: "double",
    bodyweight: true,
    notes: "",
  },
  {
    id: "barbell_row",
    displayName: "Barbell Row",
    primaryMuscles: ["back"],
    secondaryMuscles: ["lats", "biceps", "rear_delts", "lower_back"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "barbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "barbell_curl",
    displayName: "Barbell Curl",
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "barbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "hammer_curl",
    displayName: "Hammer Curl",
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "dumbbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "standing_calf_raise",
    displayName: "Standing Calf Raise",
    primaryMuscles: ["calves"],
    secondaryMuscles: [],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "machine",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
  {
    id: "seated_calf_raise",
    displayName: "Seated Calf Raise",
    primaryMuscles: ["calves"],
    secondaryMuscles: [],
    rotationSlots: [],
    order: DEFAULT_EXERCISE_ORDER,
    targetSets: SETS_4,
    equipment: "machine",
    progression: "double",
    bodyweight: false,
    notes: "",
  },
];
