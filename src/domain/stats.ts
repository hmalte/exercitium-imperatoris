// Pure stats derivations feeding the Codex Imperialis charts.
//
// Everything here returns plain arrays/objects. No React, no Recharts, no
// Obsidian — the view layer composes these outputs into chart-specific
// shapes.
//
// The functions here DO NOT do the time-window filtering themselves. They
// produce full-history series; the Codex view slices down to the currently
// selected window. That split means we compute once per dataset change, not
// once per toggle flip.

import type { SessionFile, ExerciseFile, LoAFile } from "./schemas";
import type { ISODate } from "./timeLogic";
import { addDays, isInLeaveOfAbsence } from "./timeLogic";
import {
  MUSCLE_TO_GROUP,
  MUSCLE_GROUPS,
  type MuscleGroup,
} from "./landmarks";
import { computeMuscleStats } from "./volume";

// ---------------------------------------------------------------------------
// Epley 1RM
// ---------------------------------------------------------------------------
//
// Standard estimated one-rep-max formula. Used by the Astartes Aspiration
// chart to plot strength progression without requiring the user to actually
// test their 1RM.
//
//   e1RM = weight × (1 + reps / 30)
//
// Quirks:
//   • Reps ≤ 0 return 0 — a failed rep doesn't imply a max.
//   • The 1/30 nudge applies at 1 rep too (100kg × 1 → ~103kg estimate).
//     Some sources cap at 1; we don't, because consistency beats a special
//     case, and any series of logged sets is relative anyway.

export function epleyOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0) return 0;
  return weightKg * (1 + reps / 30);
}

// Highest estimated 1RM ever recorded for a given exercise, across every
// session's every set. Used by the Ritual view's PR banner to decide whether
// a just-logged set beats the user's historical best.
//
// Returns 0 if the exercise has never been logged with a positive weight —
// treat that as "no baseline yet", and the caller can decide whether the
// first weighted set of an exercise counts as a PR (we currently don't show
// the banner until there's a non-zero baseline to beat, which spares users
// a dopamine hit the first time they tap Log Set).
export function bestEpleyForExercise(
  sessions: SessionFile[],
  exerciseId: string,
): number {
  let best = 0;
  for (const sess of sessions) {
    for (const sessEx of sess.exercises) {
      if (sessEx.name !== exerciseId) continue;
      for (const set of sessEx.sets) {
        const e = epleyOneRepMax(set.weightKg, set.reps);
        if (e > best) best = e;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Shared series type
// ---------------------------------------------------------------------------

export type DatedPoint = {
  date: ISODate;
  value: number;
};

// ---------------------------------------------------------------------------
// Bodyweight / sleep timelines
// ---------------------------------------------------------------------------
//
// One point per session that recorded the relevant field. Sessions that
// skipped the intake/outtake prompt are silently dropped — no zero points,
// no interpolation.

export function bodyweightTimeline(sessions: SessionFile[]): DatedPoint[] {
  const out: DatedPoint[] = [];
  for (const s of sessions) {
    if (s.bodyweightKg !== null) {
      out.push({ date: s.date, value: s.bodyweightKg });
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export function sleepTimeline(sessions: SessionFile[]): DatedPoint[] {
  const out: DatedPoint[] = [];
  for (const s of sessions) {
    if (s.sleepHours !== null) {
      out.push({ date: s.date, value: s.sleepHours });
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

// ---------------------------------------------------------------------------
// Rolling average
// ---------------------------------------------------------------------------
//
// For each point P in `series`, compute the mean of every point whose date
// falls in [P.date - (windowDays - 1), P.date] — i.e. the last N days
// ending on (and including) P's own date. Result has the same length as
// the input, with value replaced by the average.
//
// If windowDays ≤ 0, acts as identity. Point P's own value always factors
// into its own average, so the series is never empty for an empty window.

export function rollingAverage(
  series: DatedPoint[],
  windowDays: number,
): DatedPoint[] {
  if (windowDays <= 0) {
    return series.map((p) => ({ date: p.date, value: p.value }));
  }
  const out: DatedPoint[] = [];
  for (const p of series) {
    const cutoff = addDays(p.date, -(windowDays - 1));
    let sum = 0;
    let count = 0;
    for (const q of series) {
      if (q.date >= cutoff && q.date <= p.date) {
        sum += q.value;
        count++;
      }
    }
    // count is always ≥ 1 because p is in its own window.
    out.push({ date: p.date, value: sum / count });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Weekly volume by muscle group
// ---------------------------------------------------------------------------
//
// Used by the Encumbrance Lifted Off the Soul stacked bar chart. One row
// per week that had at least one session, weeks run Monday → Sunday, and
// each row has a sets-per-group number for every group (0 for untrained
// groups, so the stacked bar renders cleanly).

export type WeeklyVolumeRow = {
  /** The Monday that starts this week. */
  weekStart: ISODate;
  /** Effective sets per muscle group for this week. Every group present. */
  groups: Record<MuscleGroup, number>;
};

export function weeklyVolumeByGroup(
  sessions: SessionFile[],
  exercises: ExerciseFile[],
): WeeklyVolumeRow[] {
  if (sessions.length === 0) return [];

  // Bucket sessions by their Monday. Every date maps to exactly one bucket.
  const buckets = new Map<ISODate, ISODate[]>();
  const dateSet = new Set<ISODate>();
  for (const s of sessions) dateSet.add(s.date);
  for (const date of dateSet) {
    const m = mondayOf(date);
    const list = buckets.get(m) ?? [];
    list.push(date);
    buckets.set(m, list);
  }

  const rows: WeeklyVolumeRow[] = [];
  for (const monday of buckets.keys()) {
    // Pass ALL sessions into computeMuscleStats; its cutoff/today filter
    // already restricts which sessions contribute, AND its bodyweight
    // carry-forward reads pre-window sessions to pick the latest recorded
    // weight. Passing only the week's sessions would give zero-tonnage
    // bodyweight estimates whenever the user last weighed in before the
    // week started.
    const stats = computeMuscleStats(
      sessions,
      exercises,
      7,
      addDays(monday, 6),
    );
    const groups = emptyGroupCounts();
    for (const s of stats) {
      const g = MUSCLE_TO_GROUP[s.muscle];
      groups[g] += s.sets;
    }
    rows.push({ weekStart: monday, groups });
  }
  rows.sort((a, b) =>
    a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0,
  );
  return rows;
}

function emptyGroupCounts(): Record<MuscleGroup, number> {
  const out = {} as Record<MuscleGroup, number>;
  for (const g of MUSCLE_GROUPS) out[g] = 0;
  return out;
}

/**
 * The Monday (ISO-week start) for `date`. Weeks are Mon-Sun so a Sunday
 * session belongs to the week that started six days earlier.
 */
export function mondayOf(date: ISODate): ISODate {
  // Parse as UTC midnight so local DST never shifts the day index.
  const d = new Date(date + "T00:00:00Z");
  const day = d.getUTCDay(); // Sun=0, Mon=1, ... Sat=6
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

// ---------------------------------------------------------------------------
// Per-lift estimated 1RM progression
// ---------------------------------------------------------------------------
//
// For each non-bodyweight exercise that appears in any session, emit a
// time series of the best Epley 1RM across that session's sets. Skipping
// bodyweight lifts is intentional: without a recorded bodyweight their
// estimates would be 0, and even with one, they drift around with the
// user's scale rather than their strength.
//
// Output is sorted by number of data points (desc) so the chart can offer
// the most-trained lifts up top in the lift picker.

export type LiftSeries = {
  exerciseId: string;
  displayName: string;
  points: DatedPoint[];
};

export function oneRepMaxSeriesByLift(
  sessions: SessionFile[],
  exercises: ExerciseFile[],
): LiftSeries[] {
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const byLift = new Map<string, DatedPoint[]>();

  const sorted = [...sessions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  for (const sess of sorted) {
    for (const sessEx of sess.exercises) {
      const ex = exById.get(sessEx.name);
      if (!ex || ex.bodyweight) continue;
      let best = 0;
      for (const set of sessEx.sets) {
        const e = epleyOneRepMax(set.weightKg, set.reps);
        if (e > best) best = e;
      }
      if (best <= 0) continue;
      const list = byLift.get(ex.id) ?? [];
      list.push({ date: sess.date, value: best });
      byLift.set(ex.id, list);
    }
  }

  const result: LiftSeries[] = [];
  for (const [id, points] of byLift.entries()) {
    const ex = exById.get(id);
    if (!ex) continue;
    result.push({
      exerciseId: id,
      displayName: ex.displayName || id,
      points,
    });
  }
  result.sort((a, b) => b.points.length - a.points.length);
  return result;
}

// ---------------------------------------------------------------------------
// Streak ribbon (Days of Glory)
// ---------------------------------------------------------------------------
//
// Day-by-day state array ending at `today` (inclusive), going back `days`
// calendar days. The Codex paints one colored square per day.
//
// Priority order when tagging a day:
//   1. Inside a declared Leave of Absence → "loa"
//   2. A Cardio Week session was logged  → "cardio"
//   3. Any other session was logged       → "trained"
//   4. Nothing                            → "rest"
//
// LoA wins over a logged session because if the user logged during an LoA,
// the intent was clearly to be resting — the brief says that scenario ends
// the LoA via a different flow, not that the day becomes "trained". For
// the ribbon we honor the LoA period as declared.

export type DayState = "trained" | "cardio" | "rest" | "loa";

export type RibbonDay = {
  date: ISODate;
  state: DayState;
};

export function streakRibbon(
  sessions: SessionFile[],
  loas: LoAFile[],
  today: ISODate,
  days: number,
): RibbonDay[] {
  const sessByDate = new Map<ISODate, SessionFile>();
  for (const s of sessions) sessByDate.set(s.date, s);

  // timeLogic.isInLeaveOfAbsence takes a LoA-shape with just start/end;
  // LoAFile has those plus extras and is structurally compatible.
  const out: RibbonDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    let state: DayState;
    if (isInLeaveOfAbsence(d, loas)) {
      state = "loa";
    } else {
      const sess = sessByDate.get(d);
      if (sess) {
        state = sess.isCardioWeek ? "cardio" : "trained";
      } else {
        state = "rest";
      }
    }
    out.push({ date: d, state });
  }
  return out;
}
