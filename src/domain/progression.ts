// Double-progression suggestions.
//
// The rule we implement:
//   - Rep range is 3-8 by default.
//   - Look at the top (first) set of the most recent session where this
//     exercise was performed.
//   - If that top set hit the max reps (8): suggest NEXT session uses
//     (last_weight + increment, reset to min reps (3)).
//   - Otherwise: suggest (same weight, last_top_reps + 1).
//   - For bodyweight lifts (last weight = 0): we can't add weight, so we
//     just keep adding reps past the ceiling.
//
// "Top set" = first logged set of the session. Double progression typically
// tracks each set independently, but for a one-line UI suggestion using the
// top set as the baseline is both simple and close to what the user does
// in practice (start the session at the target, fatigue drops later sets).

import type { SessionFile, SessionExercise, SetEntry } from "./schemas";

export type ProgressionSuggestion = {
  /** Next target reps for the top set. */
  reps: number;
  /** Next target weight in kg. 0 means bodyweight. */
  weightKg: number;
  /** The last session's sets for this exercise, or null if never done before. */
  lastSets: SetEntry[] | null;
  /** ISO date of the last session that did this exercise, or null. */
  lastDate: string | null;
};

const DEFAULT_INCREMENT_KG = 2.5;
const DEFAULT_MIN_REPS = 3;
const DEFAULT_MAX_REPS = 8;
const DEFAULT_FIRST_TIME_REPS = 5;

export function suggestNext(
  exerciseId: string,
  sessions: SessionFile[],
  opts: {
    incrementKg?: number;
    minReps?: number;
    maxReps?: number;
  } = {},
): ProgressionSuggestion {
  const increment = opts.incrementKg ?? DEFAULT_INCREMENT_KG;
  const minReps = opts.minReps ?? DEFAULT_MIN_REPS;
  const maxReps = opts.maxReps ?? DEFAULT_MAX_REPS;

  const prior = findLastSessionWith(exerciseId, sessions);
  if (!prior) {
    // No history. Start in the middle of the rep range at 0 kg — the user
    // will type in a weight.
    return {
      reps: DEFAULT_FIRST_TIME_REPS,
      weightKg: 0,
      lastSets: null,
      lastDate: null,
    };
  }

  const topSet = prior.exercise.sets[0];

  if (topSet.reps >= maxReps && topSet.weightKg > 0) {
    // Graduated the rep range on a weighted lift — add weight, reset reps.
    return {
      reps: minReps,
      weightKg: topSet.weightKg + increment,
      lastSets: prior.exercise.sets,
      lastDate: prior.date,
    };
  }

  // Either still in the rep range, or bodyweight (no weight to add).
  return {
    reps: topSet.reps + 1,
    weightKg: topSet.weightKg,
    lastSets: prior.exercise.sets,
    lastDate: prior.date,
  };
}

// Find the most recent session that logged `exerciseId`, and the matching
// per-exercise entry within it. Returns null if the user has never done it.
function findLastSessionWith(
  exerciseId: string,
  sessions: SessionFile[],
): { date: string; exercise: SessionExercise } | null {
  const sorted = [...sessions].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  for (const s of sorted) {
    const match = s.exercises.find((e) => e.name === exerciseId);
    if (match && match.sets.length > 0) {
      return { date: s.date, exercise: match };
    }
  }
  return null;
}
