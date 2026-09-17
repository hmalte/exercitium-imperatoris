// Volume landmarks — MEV / MAV / MRV per muscle group.
//
// Terminology (Renaissance Periodization):
//   • MEV — Minimum Effective Volume. Below this, the muscle isn't stimulated
//     enough to grow.
//   • MAV — Maximum Adaptive Volume. The top of the "productive" range;
//     doing more still grows but fatigue builds faster than it's recovered.
//   • MRV — Maximum Recoverable Volume. Beyond this, recovery breaks down
//     and progress reverses.
//
// We measure "volume" as effective sets per week per muscle GROUP (not per
// muscle). Groups are coarser than our 16-muscle schema: the library's
// back and lats both count toward one "back" group because in RP thinking
// they're trained together and share a single landmark budget. Same for
// abs + obliques → "core".
//
// Layering:
//   1. Pure classification math (classifyVolume, weeklyAverage) — tested.
//   2. Group membership (MUSCLE_TO_GROUP) — tested.
//   3. Default landmark values from the brief — frozen here; the user edits
//      their own copy in `settings/volume-landmarks.md`.
//   4. Parse/serialize helpers for the markdown file.

import { splitFrontmatter, joinFrontmatter } from "./frontmatter";
import type { Muscle } from "./schemas";

// -----------------------------------------------------------------------------
// Groups
// -----------------------------------------------------------------------------
//
// 14 groups covering all 16 muscles. The only collapses are:
//   • back + lats   → "back"   (brief: "lats + upper back combined")
//   • abs + obliques → "core"
// Every other muscle maps 1:1 to its own group.

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "lower_back",
  "front_delts",
  "side_delts",
  "rear_delts",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "forearms",
  "core",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_TO_GROUP: Record<Muscle, MuscleGroup> = {
  chest: "chest",
  back: "back",
  lats: "back",
  lower_back: "lower_back",
  quads: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  calves: "calves",
  front_delts: "front_delts",
  side_delts: "side_delts",
  rear_delts: "rear_delts",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  abs: "core",
  obliques: "core",
};

// -----------------------------------------------------------------------------
// Landmarks & defaults
// -----------------------------------------------------------------------------

export type Landmarks = {
  mev: number;
  mav: number;
  mrv: number;
};

// Defaults straight from the brief. Lower_back and forearms aren't listed
// there — we pick conservative intermediate values so they get classified
// sensibly out of the box. The user can edit either any time.
export const DEFAULT_LANDMARKS: Record<MuscleGroup, Landmarks> = {
  chest:       { mev: 8,  mav: 14, mrv: 20 },
  back:        { mev: 10, mav: 16, mrv: 22 },
  lower_back:  { mev: 4,  mav: 8,  mrv: 12 },
  front_delts: { mev: 6,  mav: 10, mrv: 16 },
  side_delts:  { mev: 8,  mav: 16, mrv: 22 },
  rear_delts:  { mev: 8,  mav: 14, mrv: 20 },
  biceps:      { mev: 8,  mav: 14, mrv: 20 },
  triceps:     { mev: 6,  mav: 12, mrv: 18 },
  quads:       { mev: 8,  mav: 14, mrv: 20 },
  hamstrings:  { mev: 6,  mav: 12, mrv: 18 },
  glutes:      { mev: 4,  mav: 10, mrv: 16 },
  calves:      { mev: 8,  mav: 14, mrv: 20 },
  forearms:    { mev: 4,  mav: 8,  mrv: 14 },
  core:        { mev: 6,  mav: 12, mrv: 20 },
};

// -----------------------------------------------------------------------------
// Classification
// -----------------------------------------------------------------------------

export type VolumeStatus = "under_mev" | "mev_mav" | "mav_mrv" | "over_mrv";

/**
 * Bucket a weekly set count into one of four training-volume zones.
 *
 * Boundary convention:
 *   weeklySets <  mev           → under_mev  (red: not enough to grow)
 *   mev  ≤ weeklySets <  mav    → mev_mav    (green: productive range)
 *   mav  ≤ weeklySets ≤  mrv    → mav_mrv    (yellow: still growing, grinding)
 *   weeklySets >  mrv           → over_mrv   (red: overreaching)
 *
 * Exact-on-MAV lands in yellow because MAV is the top of the sustainable
 * range — one more set is the start of the grind zone.
 */
export function classifyVolume(
  weeklySets: number,
  landmarks: Landmarks,
): VolumeStatus {
  if (weeklySets < landmarks.mev) return "under_mev";
  if (weeklySets < landmarks.mav) return "mev_mav";
  if (weeklySets <= landmarks.mrv) return "mav_mrv";
  return "over_mrv";
}

/**
 * Convert a raw set count observed in a rolling window of `windowDays` days
 * into a "per week" rate. If windowDays is 7, this is identity; for 14/28/56
 * it divides out the extra weeks.
 */
export function weeklyAverage(sets: number, windowDays: number): number {
  if (windowDays <= 0) return 0;
  return (sets * 7) / windowDays;
}

// -----------------------------------------------------------------------------
// File I/O (YAML frontmatter)
// -----------------------------------------------------------------------------
//
// On disk the file looks like:
//
//   ---
//   chest:
//     mev: 8
//     mav: 14
//     mrv: 20
//   back:
//     mev: 10
//     ...
//   ---
//   Volume landmarks — edit the numbers above to tune the Sanctum's
//   under/over-trained coloring. Weekly sets per muscle group.
//
// Parser is defensive: any missing group falls back to DEFAULT_LANDMARKS for
// that group, so a partial/malformed file never produces NaN in the UI.

const LANDMARKS_BODY = `Volume landmarks — edit the numbers above to tune the Sanctum's
under/over-trained coloring. Values are weekly sets per muscle group.

  • MEV — minimum effective volume (below this, no growth)
  • MAV — maximum adaptive volume  (top of productive range)
  • MRV — maximum recoverable volume (beyond this, overreaching)

Groups "back" and "core" cover multiple schema muscles: back = back + lats,
core = abs + obliques. Landmarks apply to the combined weekly set total.
`;

export function parseVolumeLandmarks(
  raw: string,
): Record<MuscleGroup, Landmarks> {
  const { data } = splitFrontmatter(raw);
  const out = {} as Record<MuscleGroup, Landmarks>;
  for (const group of MUSCLE_GROUPS) {
    const entry = data[group];
    out[group] = readLandmarks(entry, DEFAULT_LANDMARKS[group]);
  }
  return out;
}

export function serializeVolumeLandmarks(
  landmarks: Record<MuscleGroup, Landmarks>,
): string {
  const data: Record<string, unknown> = {};
  for (const group of MUSCLE_GROUPS) {
    const l = landmarks[group];
    data[group] = { mev: l.mev, mav: l.mav, mrv: l.mrv };
  }
  return joinFrontmatter(data, LANDMARKS_BODY);
}

function readLandmarks(entry: unknown, fallback: Landmarks): Landmarks {
  if (!entry || typeof entry !== "object") return fallback;
  const obj = entry as Record<string, unknown>;
  return {
    mev: numOr(obj.mev, fallback.mev),
    mav: numOr(obj.mav, fallback.mav),
    mrv: numOr(obj.mrv, fallback.mrv),
  };
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
