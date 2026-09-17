// Per-muscle stimulus counting.
//
// We track two independent numbers per muscle:
//   • sets      — how many "effective sets" hit this muscle
//   • tonnageKg — how much weight moved for this muscle (kg × reps)
//
// They're kept separate on purpose: the heatmap view (Phase 5b) colors
// muscles by SET count (direct stimulus), while the tonnage column in the
// Sanctum table is the load-volume number (useful for strength progression).
//
// Set-count convention (Renaissance Periodization style "fractional sets"):
//   A set on an exercise with primary muscles [A, B] and secondary muscles
//   [C] contributes:
//     • 1.0 set to A, 1.0 set to B, 0.5 sets to C
//     • reps×effectiveWeight tonnage to A and B, 0.5× that to C
//
// Effective weight:
//   • Regular exercises: whatever the user logged in weightKg.
//   • Bodyweight exercises (weightKg = 0 AND exercise.bodyweight = true):
//     use the user's most recently recorded bodyweight at or before the
//     session date. If bodyweight has never been recorded, tonnage is 0
//     (but the set still counts toward sets).
//
// This matches the user's split: "how many sets hit a muscle" is one number,
// and "how much weight moved through a muscle" is a separate number — with
// bodyweight exercises contributing their real load estimate to the second.

import type { SessionFile, ExerciseFile, Muscle } from "./schemas";
import { MUSCLES } from "./schemas";
import { addDays, type ISODate } from "./timeLogic";

export type MuscleStats = {
  muscle: Muscle;
  /** Effective sets: 1.0 per primary muscle, 0.5 per secondary. */
  sets: number;
  /** Total tonnage (kg × reps), weighted the same way as sets. */
  tonnageKg: number;
  /** Total reps, weighted the same way as sets. */
  reps: number;
};

const SECONDARY_WEIGHT = 0.5;

/**
 * Roll up every set in `sessions` within the last `windowDays` days
 * (inclusive of today) and attribute it to muscles via each exercise's
 * primary/secondary muscle list.
 *
 * Bodyweight exercises get their tonnage estimated using the last recorded
 * bodyweight at or before each session's date. That lookup is O(sessions)
 * with pre-computed rolling state, so the whole function stays linear.
 *
 * Returns one entry per muscle in MUSCLES order — muscles that weren't
 * trained in the window appear as zeros, so callers can render a stable,
 * full-height table without holes.
 */
export function computeMuscleStats(
  sessions: SessionFile[],
  exercises: ExerciseFile[],
  windowDays: number,
  today: ISODate,
): MuscleStats[] {
  // Inclusive window: today counts as day 1.
  const cutoff = addDays(today, -(windowDays - 1));
  const exById = new Map(exercises.map((e) => [e.id, e]));

  // Initialize accumulators for every known muscle so the output is stable.
  const totals = new Map<Muscle, { sets: number; tonnage: number; reps: number }>();
  for (const m of MUSCLES) {
    totals.set(m, { sets: 0, tonnage: 0, reps: 0 });
  }

  // Walk sessions in date order so we can keep a running "last known
  // bodyweight" as we go. A session's bodyweight applies to that session's
  // bodyweight exercises — if none is recorded, we carry the previous value.
  const sortedSessions = [...sessions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  let currentBodyweightKg: number | null = null;

  for (const session of sortedSessions) {
    // Roll bodyweight forward BEFORE we process the session, so a bodyweight
    // recorded today applies to today's exercises.
    if (session.bodyweightKg !== null) {
      currentBodyweightKg = session.bodyweightKg;
    }

    if (session.date < cutoff || session.date > today) continue;

    for (const sessEx of session.exercises) {
      const ex = exById.get(sessEx.name);
      // Unknown exercise id — silently skip rather than poison the dashboard.
      // Most likely the user renamed something or hand-typed a name.
      if (!ex) continue;
      for (const set of sessEx.sets) {
        // For bodyweight exercises the logged weight is usually 0 ("I did
        // pullups"). Substitute the user's bodyweight. If the user DID log
        // added weight (e.g. 10kg dip belt), add it on top.
        const effectiveWeight = ex.bodyweight
          ? (currentBodyweightKg ?? 0) + set.weightKg
          : set.weightKg;
        const tonnage = effectiveWeight * set.reps;

        for (const m of ex.primaryMuscles) {
          const t = totals.get(m);
          if (!t) continue;
          t.sets += 1;
          t.tonnage += tonnage;
          t.reps += set.reps;
        }
        for (const m of ex.secondaryMuscles) {
          const t = totals.get(m);
          if (!t) continue;
          t.sets += SECONDARY_WEIGHT;
          t.tonnage += tonnage * SECONDARY_WEIGHT;
          t.reps += set.reps * SECONDARY_WEIGHT;
        }
      }
    }
  }

  return MUSCLES.map((m) => {
    const t = totals.get(m)!;
    return {
      muscle: m,
      sets: t.sets,
      tonnageKg: t.tonnage,
      reps: t.reps,
    };
  });
}

/**
 * The most recent bodyweight recorded at or before `date`. Returns null if
 * the user has never logged one. Used by the Ritual's sleep step to prefill
 * the bodyweight input.
 */
export function lastRecordedBodyweight(
  sessions: SessionFile[],
  date: ISODate,
): number | null {
  let best: number | null = null;
  let bestDate: ISODate | null = null;
  for (const s of sessions) {
    if (s.bodyweightKg === null) continue;
    if (s.date > date) continue;
    if (bestDate === null || s.date > bestDate) {
      best = s.bodyweightKg;
      bestDate = s.date;
    }
  }
  return best;
}
