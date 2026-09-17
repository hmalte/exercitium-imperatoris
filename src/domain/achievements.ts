// Achievement detection for session-level milestones.
//
// Four triggers (matching the four keys in the seeded companion quote pool):
//
//   session_five_exercises   → the just-saved session contains ≥ 5 distinct
//                              exercises. Celebrates breadth of movement.
//   ten_sets_group           → some muscle GROUP received ≥ 10 effective sets
//                              in the just-saved session. One achievement per
//                              group that crossed the line.
//   fifteen_sets_group       → same, threshold 15. Takes priority over the
//                              ten-set award for the same group — a 15-set
//                              chest day earns one fifteen card, not one of
//                              each.
//   five_cardio_month        → five CARDIO days inside the rolling 31-day
//                              window. Replaced an older "two hours of
//                              cardio" award, which was fed mostly by the
//                              post-workout cardio finisher; that step is
//                              gone (the sauna cleanse took its place), so
//                              the minutes-based threshold had become
//                              effectively unreachable. Counts days rather
//                              than minutes, matching how cardio is now
//                              logged: one session, one march or sprint.
//                              Shares its window with the Altar's cardio
//                              tally, so the user watches the very number
//                              that triggers the card climb toward five.
//   three_session_week       → this save is the 3rd session in the last 7
//                              days. The plan's weekly success condition:
//                              one full turn of the push/pull/legs rotation.
//   five_session_week        → the 5th session in the same window. The
//                              stretch condition — a louder card and its own
//                              (more dramatic) quote pool. A week that hits
//                              five necessarily passed three first, so the
//                              user sees both cards, five ranked above three.
//
// The detection function takes the session being saved separately from prior
// sessions so it can compute "before" and "after" states for the weekly
// cardio threshold check. Callers pass in the character-quote pool that will
// be attached to each fired achievement card.

import type { ExerciseFile, SessionFile } from "./schemas";
import { MUSCLE_TO_GROUP, type MuscleGroup } from "./landmarks";
import { addDays, type ISODate } from "./timeLogic";
import type {
  CompanionQuote,
  CompanionQuotes,
} from "../seed/companionQuotes";

// Effective-set math for achievements is simpler than the Sanctum's:
// we count SETS only (no tonnage, no bodyweight estimates), and we count
// secondary muscles at half a set so the numbers line up with the user's
// intuition of "how many sets did I do for this group today".
const SECONDARY_WEIGHT = 0.5;

export const FIVE_EXERCISE_THRESHOLD = 5;
export const TEN_SETS_THRESHOLD = 10;
export const FIFTEEN_SETS_THRESHOLD = 15;
/** Cardio DAYS required inside the rolling window for the cardio award. */
export const FIVE_CARDIO_MONTH_THRESHOLD = 5;
/**
 * Window for both the cardio award and the Altar's cardio readout — a
 * calendar month, roughly. One window for both on purpose: the Altar shows
 * "Marches & Sprints (31d)", and the fifth one showing up there is exactly
 * what earns the card. A shorter award window would mean the dashboard and
 * the reward were counting different things.
 */
export const CARDIO_WINDOW_DAYS = 31;
/** Rare weekly award — total effective sets across all muscles across the
 *  last 7 calendar days (inclusive of today) crossing this value triggers a
 *  one-off retinue card. Chosen by the user; grim-humor of the number
 *  is not accidental. */
export const RARE_WEEK_SETS_THRESHOLD = 69;
export const RARE_WEEK_WINDOW_DAYS = 7;

/** The plan's weekly success condition: three sessions inside a rolling
 *  7-day window — one complete turn of the push/pull/legs rotation. */
export const THREE_SESSION_WEEK_THRESHOLD = 3;
/** The stretch condition. Same window, five sessions. */
export const FIVE_SESSION_WEEK_THRESHOLD = 5;
export const SESSION_WEEK_WINDOW_DAYS = 7;

export type AchievementKind =
  | "session_five_exercises"
  | "ten_sets_group"
  | "fifteen_sets_group"
  | "five_cardio_month"
  | "rare_companion_week"
  | "three_session_week"
  | "five_session_week";

export type Achievement = {
  kind: AchievementKind;
  /** Human-readable heading shown at the top of the card. */
  title: string;
  /** One-line description of the milestone itself. */
  detail: string;
  /** A randomly-picked companion quote, already attributed. */
  quote: CompanionQuote;
  /**
   * Present only on muscle-group achievements. Useful for the UI so it can
   * show which group this card is celebrating (and so tests have a handle
   * without having to parse the detail string).
   */
  group?: MuscleGroup;
};

/**
 * Inspect a session that's about to be saved and return every achievement
 * it unlocks. The returned order is the order to display — strongest
 * cards first (fifteen-set before ten-set, cardio before breadth).
 */
export function detectAchievements(args: {
  sessionBeingSaved: SessionFile;
  exercises: ExerciseFile[];
  /**
   * All sessions already on disk (NOT including the one being saved). Used
   * only by the weekly-cardio check to compute "minutes before this save".
   */
  priorSessions: SessionFile[];
  today: ISODate;
  quotes: CompanionQuotes;
  /**
   * Injected so tests are deterministic. Defaults to Math.random. Takes
   * Array<T> and returns one element; the empty-array case never happens
   * because detection only runs when the pool has at least one quote.
   */
  pickRandom?: <T>(pool: T[]) => T;
}): Achievement[] {
  const {
    sessionBeingSaved,
    exercises,
    priorSessions,
    today,
    quotes,
    pickRandom = defaultPick,
  } = args;

  const out: Achievement[] = [];

  // --- 15 / 10 sets per group (one card per group, higher wins) -------------
  const setsByGroup = effectiveSetsByGroup(sessionBeingSaved, exercises);
  for (const [group, sets] of setsByGroup.entries()) {
    if (sets >= FIFTEEN_SETS_THRESHOLD && quotes.fifteen_sets_muscle.length > 0) {
      out.push({
        kind: "fifteen_sets_group",
        title: "FIFTEEN SETS",
        detail: `${formatSets(sets)} sets for ${prettyGroup(group)} today.`,
        quote: pickRandom(quotes.fifteen_sets_muscle),
        group,
      });
      continue;
    }
    if (sets >= TEN_SETS_THRESHOLD && quotes.ten_sets_muscle.length > 0) {
      out.push({
        kind: "ten_sets_group",
        title: "TEN SETS",
        detail: `${formatSets(sets)} sets for ${prettyGroup(group)} today.`,
        quote: pickRandom(quotes.ten_sets_muscle),
        group,
      });
    }
  }

  // --- 5 distinct exercises in the session ---------------------------------
  const distinctExercises = new Set(
    sessionBeingSaved.exercises
      .filter((ex) => ex.sets.length > 0)
      .map((ex) => ex.name),
  ).size;
  if (
    distinctExercises >= FIVE_EXERCISE_THRESHOLD &&
    quotes.workout_complete.length > 0
  ) {
    out.push({
      kind: "session_five_exercises",
      title: "FIVE DISCIPLINES",
      detail: `${distinctExercises} distinct exercises logged this session.`,
      quote: pickRandom(quotes.workout_complete),
    });
  }

  // --- 5 cardio days across the last 31 days (threshold crossing) ----------
  // A "cardio day" is a day carrying a logged modality. Counting days keeps
  // this honest across the march/sprint split: a 10-minute sprint is as much
  // a day of lung work as a 30-minute march, and weighting by minutes would
  // quietly punish the harder one.
  const cardioCutoff = addDays(today, -(CARDIO_WINDOW_DAYS - 1));
  const priorCardioDates = cardioDatesInWindow(
    priorSessions,
    cardioCutoff,
    today,
  );
  const priorCardioDays = priorCardioDates.size;
  const totalCardioDays = isCardioDay(sessionBeingSaved)
    ? new Set([...priorCardioDates, sessionBeingSaved.date]).size
    : priorCardioDays;
  if (
    priorCardioDays < FIVE_CARDIO_MONTH_THRESHOLD &&
    totalCardioDays >= FIVE_CARDIO_MONTH_THRESHOLD &&
    quotes.five_cardio_month.length > 0
  ) {
    out.push({
      kind: "five_cardio_month",
      title: "FIVE MARCHES",
      detail: `${totalCardioDays} days of cardio over the last 31 days.`,
      quote: pickRandom(quotes.five_cardio_month),
    });
  }

  // --- Rare: total effective sets across 7 days cross 69 -------------------
  // "Total" means across all muscle groups, same primary=1 / secondary=0.5
  // weighting the per-group checks use. Threshold-crossing: only fires the
  // first time the rolling 7-day window clears the line, so logging a few
  // more sets the next day doesn't re-trigger. Rare by design — placed at
  // the top of the display order because it represents a whole week of
  // effort compressed into one reward moment.
  const rareCutoff = addDays(today, -(RARE_WEEK_WINDOW_DAYS - 1));
  const priorWeekSets = sumEffectiveSets(
    priorSessions,
    exercises,
    rareCutoff,
    today,
  );
  const thisSessionSets = totalEffectiveSets(sessionBeingSaved, exercises);
  const totalWeekSets = priorWeekSets + thisSessionSets;
  if (
    priorWeekSets < RARE_WEEK_SETS_THRESHOLD &&
    totalWeekSets >= RARE_WEEK_SETS_THRESHOLD &&
    quotes.rare_companion.length > 0
  ) {
    out.push({
      kind: "rare_companion_week",
      title: "A WEEK OF DEVOTION",
      detail: `${formatSets(totalWeekSets)} effective sets across the last 7 days.`,
      quote: pickRandom(quotes.rare_companion),
    });
  }

  // --- Weekly session count: 3 (success) and 5 (stretch) -------------------
  // Both are threshold crossings on the same rolling 7-day window, counted
  // over prior sessions plus this one. A week that reaches five fires the
  // three-card on its third save and the five-card on its fifth, so the two
  // never compete for the same moment — but if the user somehow lands both
  // on one save (e.g. backfilled sessions), five sorts above three.
  const sessionCutoff = addDays(today, -(SESSION_WEEK_WINDOW_DAYS - 1));
  const priorSessionDates = sessionDatesInWindow(
    priorSessions,
    sessionCutoff,
    today,
  );
  const priorSessionCount = priorSessionDates.size;
  // Union rather than +1: re-saving a date that's already on disk mustn't
  // manufacture a crossing and hand out the same card twice.
  const totalSessionCount = new Set([
    ...priorSessionDates,
    sessionBeingSaved.date,
  ]).size;

  if (
    priorSessionCount < THREE_SESSION_WEEK_THRESHOLD &&
    totalSessionCount >= THREE_SESSION_WEEK_THRESHOLD &&
    quotes.three_session_week.length > 0
  ) {
    out.push({
      kind: "three_session_week",
      title: "THE WEEK IS KEPT",
      detail: `${totalSessionCount} sessions in the last 7 days. The rotation has turned once.`,
      quote: pickRandom(quotes.three_session_week),
    });
  }

  if (
    priorSessionCount < FIVE_SESSION_WEEK_THRESHOLD &&
    totalSessionCount >= FIVE_SESSION_WEEK_THRESHOLD &&
    quotes.five_session_week.length > 0
  ) {
    out.push({
      kind: "five_session_week",
      title: "FIVE DAYS UNBROKEN",
      detail: `${totalSessionCount} sessions in the last 7 days. Far beyond what was asked.`,
      quote: pickRandom(quotes.five_session_week),
    });
  }

  // Display order: fifteen-set, ten-set, cardio, five-exercise. Strongest
  // at the top so if the user glances at only one card they see the
  // highest-value one first.
  return out.sort((a, b) => order(a.kind) - order(b.kind));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function order(kind: AchievementKind): number {
  // Rare first — it represents the biggest span of effort (a whole week)
  // and should be the loudest card when the user crosses it. The five-session
  // week sits directly behind it: also a whole-week award, and the stretch
  // goal, so it outranks any single-session flex. The three-session week is
  // the plan's baseline success condition, so it ranks below the loud
  // single-session cards but above the cardio and breadth nudges.
  switch (kind) {
    case "rare_companion_week":
      return 0;
    case "five_session_week":
      return 1;
    case "fifteen_sets_group":
      return 2;
    case "ten_sets_group":
      return 3;
    case "three_session_week":
      return 4;
    case "five_cardio_month":
      return 5;
    case "session_five_exercises":
      return 6;
  }
}

function defaultPick<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

// Sum effective sets per GROUP for a single session. Uses the same primary=1,
// secondary=0.5 rule as the Sanctum's volume math so the achievement and the
// dashboard line up. Unknown exercise ids are skipped silently — safer than
// throwing on a user's hand-edited typo.
function effectiveSetsByGroup(
  session: SessionFile,
  exercises: ExerciseFile[],
): Map<MuscleGroup, number> {
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const totals = new Map<MuscleGroup, number>();

  for (const sessEx of session.exercises) {
    const ex = exById.get(sessEx.name);
    if (!ex) continue;
    const setCount = sessEx.sets.length;
    if (setCount === 0) continue;

    // Collapse primary + secondary muscles down to unique groups so a lift
    // that hits quads primary and quads secondary (contrived, but possible
    // in user-edited data) doesn't double-count against its own group.
    const primaryGroups = new Set(
      ex.primaryMuscles.map((m) => MUSCLE_TO_GROUP[m]),
    );
    const secondaryGroups = new Set(
      ex.secondaryMuscles
        .map((m) => MUSCLE_TO_GROUP[m])
        .filter((g) => !primaryGroups.has(g)),
    );

    for (const g of primaryGroups) {
      totals.set(g, (totals.get(g) ?? 0) + setCount);
    }
    for (const g of secondaryGroups) {
      totals.set(g, (totals.get(g) ?? 0) + setCount * SECONDARY_WEIGHT);
    }
  }

  return totals;
}

/**
 * How many days were trained inside the rolling weekly window ending today.
 *
 * This is the number the weekly 3- and 5-session conditions are judged on,
 * exported so the Altar can display the same figure it will later be
 * rewarded for. Deriving the readout and the award from one function means
 * the dashboard can't say 2/3 while the detector thinks you're at 3.
 *
 * Counts days, not sessions: two saves on one date is one training day.
 */
export function weeklySessionCount(
  sessions: SessionFile[],
  today: ISODate,
): number {
  const cutoff = addDays(today, -(SESSION_WEEK_WINDOW_DAYS - 1));
  return sessionDatesInWindow(sessions, cutoff, today).size;
}

// The set of distinct session DATES falling in [cutoff, today] inclusive.
//
// Dates rather than files: the vault stores one session per calendar date
// (`sessions/<date>.md`), so a caller passing a hand-edited or duplicated
// list can't inflate the week. Every logged session counts toward the weekly
// condition, including a Sanguinary cardio day — it's still a day the user
// showed up.
function sessionDatesInWindow(
  sessions: SessionFile[],
  cutoff: ISODate,
  today: ISODate,
): Set<ISODate> {
  const dates = new Set<ISODate>();
  for (const s of sessions) {
    if (s.date < cutoff || s.date > today) continue;
    dates.add(s.date);
  }
  return dates;
}

/**
 * Did this session involve cardio? True when a modality was recorded — that
 * only happens on a logged cardio session, so it can't be tripped by a
 * strength day. Exported so the Altar's 31-day tally uses the same rule the
 * award does.
 */
export function isCardioDay(session: SessionFile): boolean {
  return session.cardioType !== null;
}

// Distinct DATES carrying cardio in [cutoff, today] inclusive.
function cardioDatesInWindow(
  sessions: SessionFile[],
  cutoff: ISODate,
  today: ISODate,
): Set<ISODate> {
  const dates = new Set<ISODate>();
  for (const s of sessions) {
    if (s.date < cutoff || s.date > today) continue;
    if (isCardioDay(s)) dates.add(s.date);
  }
  return dates;
}

/**
 * Cardio days inside the trailing `windowDays` ending today — the Altar's
 * "cardio units" readout. One logged cardio session is one unit, regardless
 * of modality or duration.
 */
export function cardioDayCount(
  sessions: SessionFile[],
  today: ISODate,
  windowDays: number = CARDIO_WINDOW_DAYS,
): number {
  const cutoff = addDays(today, -(windowDays - 1));
  return cardioDatesInWindow(sessions, cutoff, today).size;
}


/**
 * Total effective sets (primary=1, secondary=0.5) for a single session.
 * Sums across every group a lift touches — so 3 sets of a bench press that
 * works chest (primary) and triceps (secondary) contributes 3 + 1.5 = 4.5.
 * That matches the per-group math used elsewhere in this file; a "rare
 * week" card is really the sum of those group-level totals over 7 days.
 *
 * Exported so the Chronicle modal can reuse the same weighting.
 */
export function totalEffectiveSets(
  session: SessionFile,
  exercises: ExerciseFile[],
): number {
  const exById = new Map(exercises.map((e) => [e.id, e]));
  let total = 0;
  for (const sessEx of session.exercises) {
    const ex = exById.get(sessEx.name);
    if (!ex) continue;
    const setCount = sessEx.sets.length;
    if (setCount === 0) continue;
    const primaryGroups = new Set(
      ex.primaryMuscles.map((m) => MUSCLE_TO_GROUP[m]),
    );
    const secondaryGroups = new Set(
      ex.secondaryMuscles
        .map((m) => MUSCLE_TO_GROUP[m])
        .filter((g) => !primaryGroups.has(g)),
    );
    total += setCount * primaryGroups.size;
    total += setCount * SECONDARY_WEIGHT * secondaryGroups.size;
  }
  return total;
}

// Sum effective sets across every session whose date falls in
// [cutoff, today] inclusive. Drives the rare-week 69-set check.
function sumEffectiveSets(
  sessions: SessionFile[],
  exercises: ExerciseFile[],
  cutoff: ISODate,
  today: ISODate,
): number {
  let total = 0;
  for (const s of sessions) {
    if (s.date < cutoff || s.date > today) continue;
    total += totalEffectiveSets(s, exercises);
  }
  return total;
}

// "front_delts" → "Front Delts". Keeps the label human without forcing a
// centralized display-names table that would drift from MUSCLE_GROUPS.
function prettyGroup(group: MuscleGroup): string {
  return group
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Sets are often fractional thanks to the secondary=0.5 rule. Drop the
// trailing ".0" when the number is whole so "10 sets" reads cleanly.
function formatSets(sets: number): string {
  return Number.isInteger(sets) ? String(sets) : sets.toFixed(1);
}
