// Which muscle groups are behind, and what trains them.
//
// This is the engine behind the Ritual's accessory picker. The day's barbell
// anchor is fixed; everything after it is chosen by asking which groups have
// the largest volume debt and offering the lifts that address them.
//
// Three decisions are worth stating, because each one is a judgement rather
// than an obvious reading of the data.
//
// 1. THE TARGET IS MAV, NOT MEV.
//    MEV is the maintenance floor — the volume below which you lose ground
//    and above which you roughly tread water. Growth lives between MAV and
//    MRV. A picker that lit up below MEV and went quiet the moment you
//    cleared it would be steering toward maintenance, which is not what
//    anyone trains for. So the gap measured here is distance to MAV, and a
//    group only drops off the list once it reaches MAV.
//
// 2. DELOAD DAYS DO NOT COUNT AGAINST YOU.
//    A cardio week is prescribed rest. Measuring a plain trailing 7 days
//    through one would show every group collapsing toward zero and open the
//    next session with fourteen screaming deficits — punishing the user for
//    following the programme. The window here counts back seven TRAINING
//    days, skipping any day inside a derived cardio-week range, so a deload
//    freezes the picture rather than wrecking it.
//
// 3. ONLY PRIMARY MOVERS QUALIFY AS A REMEDY.
//    Volume accounting credits secondary muscles at half a set, which is
//    fine for a dashboard. It is not fine here: offering the bench press to
//    fix a tricep deficit would be answering "what touches this muscle"
//    when the question is "what trains it". So candidate exercises are
//    filtered on primaryMuscles only, even though the deficit itself is
//    computed from the full weighted total.

import type { ExerciseFile, SessionFile } from "./schemas";
import {
  MUSCLE_TO_GROUP,
  weeklyAverage,
  type Landmarks,
  type MuscleGroup,
} from "./landmarks";
import { computeMuscleStats } from "./volume";
import {
  addDays,
  daysBetween,
  deriveCardioWeekRanges,
  effectiveWindow,
  type ISODate,
  type LoA,
  type Session,
} from "./timeLogic";

/** Training days measured. Seven, because MEV/MAV are weekly figures. */
export const DEFICIT_WINDOW_DAYS = 7;

export type GroupDeficit = {
  group: MuscleGroup;
  /** Effective sets over the window, expressed as a weekly rate. */
  weeklySets: number;
  mev: number;
  mav: number;
  /** Sets still owed to reach MAV. Zero once the group is at or past it. */
  toMav: number;
  /** Below the maintenance floor — worth calling out more loudly. */
  underMev: boolean;
};

/**
 * Every muscle group ranked by how far it sits below MAV, largest gap first.
 * Groups already at MAV are included with `toMav: 0` so callers can show the
 * full picture; the picker filters them out.
 */
export function rankGroupDeficits(
  sessions: SessionFile[],
  exercises: ExerciseFile[],
  landmarks: Record<MuscleGroup, Landmarks>,
  today: ISODate,
  loas: LoA[] = [],
): GroupDeficit[] {
  // Skip deload days when choosing the span — see note 2 above.
  const tl: Session[] = sessions.map((s) => ({
    date: s.date,
    isCardioWeek: s.isCardioWeek,
    rotationPosition: s.rotationPosition,
  }));
  const offRanges = [...loas, ...deriveCardioWeekRanges(tl)];
  const { start } = effectiveWindow(today, DEFICIT_WINDOW_DAYS, offRanges);

  // computeMuscleStats takes a plain day count, so widen the raw span to
  // cover the stretch that holds our seven training days. Deload days inside
  // it contribute nothing, which is the point.
  const spanDays = daysBetween(start, today) + 1;
  const stats = computeMuscleStats(sessions, exercises, spanDays, today);

  const setsByGroup = new Map<MuscleGroup, number>();
  for (const group of Object.keys(landmarks) as MuscleGroup[]) {
    setsByGroup.set(group, 0);
  }
  for (const row of stats) {
    const group = MUSCLE_TO_GROUP[row.muscle];
    setsByGroup.set(group, (setsByGroup.get(group) ?? 0) + row.sets);
  }

  const out: GroupDeficit[] = [];
  for (const [group, sets] of setsByGroup) {
    const marks = landmarks[group];
    if (!marks) continue;
    // Divide by the TRAINING days, not the raw span, so a deload does not
    // dilute the rate.
    const weekly = weeklyAverage(sets, DEFICIT_WINDOW_DAYS);
    out.push({
      group,
      weeklySets: Math.round(weekly * 10) / 10,
      mev: marks.mev,
      mav: marks.mav,
      toMav: Math.round(Math.max(0, marks.mav - weekly) * 10) / 10,
      underMev: weekly < marks.mev,
    });
  }

  // Largest debt first; group name breaks ties so the order is stable
  // between renders rather than shuffling on every recompute.
  out.sort((a, b) =>
    b.toMav !== a.toMav ? b.toMav - a.toMav : a.group < b.group ? -1 : 1,
  );
  return out;
}

/**
 * Lifts that train `group` as a PRIMARY mover — the only ones worth offering
 * as a remedy. See note 3 above for why secondary credit is excluded here
 * despite counting toward the deficit itself.
 */
export function remediesFor(
  group: MuscleGroup,
  exercises: ExerciseFile[],
): ExerciseFile[] {
  return exercises.filter((e) =>
    e.primaryMuscles.some((m) => MUSCLE_TO_GROUP[m] === group),
  );
}

/**
 * Is today inside a deload? The picker hides itself when so — the deficits
 * are frozen rather than growing, and a board full of debts during the week
 * the programme told you to rest is just nagging.
 */
export function isDeloadDay(
  sessions: SessionFile[],
  today: ISODate,
): boolean {
  const tl: Session[] = sessions.map((s) => ({
    date: s.date,
    isCardioWeek: s.isCardioWeek,
    rotationPosition: s.rotationPosition,
  }));
  return deriveCardioWeekRanges(tl).some(
    (r) => today >= r.start && today <= r.end,
  );
}

/** Re-exported so callers do not need a second import for the window edge. */
export { addDays };
