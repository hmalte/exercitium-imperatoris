// Named rotation presets.
//
// The strength cycle is selectable from a small menu of grimdark-themed
// presets rather than an arbitrary reorder. Presets keep the settings
// screen honest (the user can't accidentally save a rotation with a
// duplicate "push" and break the rotation math) and let each one carry
// its own flavor.
//
// One shipped preset:
//   astartes    — Astartes Triptych (3-day push/pull/legs).
//
// Two presets were retired when the plan settled on a 3-day rotation:
//   litany      — the old 5-day push/pull/legs/upper/lower cycle. Removed
//                 with the "upper" and "lower" slots themselves.
//   sanguinary  — push/pull/legs/cardio, with a cardio day baked into the
//                 rotation. Redundant once cardio became its own session
//                 ("The Lungs Alone"), which records a march or sprint
//                 without consuming a rotation position.
//
// Both IDs may still be sitting in a user's data.json. resolveRotationPreset
// falls back to the default for anything it doesn't recognise, so a stale
// "litany" heals itself on the next load rather than erroring — which is
// exactly what should happen, since neither cycle can be represented any more.
//
// To add a preset: append an entry to ROTATION_PRESETS and the settings
// dropdown + sanitizer pick it up automatically.

import type { RotationOrderSlot } from "./schemas";

export type RotationPresetId = "astartes";

export type RotationPreset = {
  id: RotationPresetId;
  name: string;
  description: string;
  order: RotationOrderSlot[];
};

export const ROTATION_PRESETS: Record<RotationPresetId, RotationPreset> = {
  astartes: {
    id: "astartes",
    name: "Astartes Triptych",
    description:
      "Three days — push, pull, legs. The rite in its whole and proper form.",
    order: ["push", "pull", "legs"],
  },
};

export const DEFAULT_ROTATION_PRESET: RotationPresetId = "astartes";

/** All preset IDs, for iteration in the settings UI. */
export const ROTATION_PRESET_IDS: RotationPresetId[] = ["astartes"];

/**
 * Resolve a preset by ID, falling back to the default if unknown. Keeps
 * the sanitizer in main.ts terse, and quietly repairs a data.json still
 * naming a retired preset ("litany", "sanguinary") or hand-edited to
 * nonsense.
 */
export function resolveRotationPreset(
  id: string | null | undefined,
): RotationPreset {
  if (id && (id as RotationPresetId) in ROTATION_PRESETS) {
    return ROTATION_PRESETS[id as RotationPresetId];
  }
  return ROTATION_PRESETS[DEFAULT_ROTATION_PRESET];
}
