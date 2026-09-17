// Pure domain logic for date math, streak tracking, deload counters, and rotation.
//
// Why this file exists in isolation:
//   Everything here is a pure function operating on plain data (no Obsidian
//   APIs, no vault, no UI). That lets us unit-test the hardest rules of the
//   app — "am I in a streak?", "when is cardio week due?", "which day of the
//   split is next?" — without spinning up Obsidian. If these rules are wrong,
//   every UI piece built on top is wrong, so we lock them down first.
//
// All dates are ISO 8601 calendar strings ("YYYY-MM-DD"). They sort
// lexicographically — "2026-03-09" < "2026-03-10" — which means we can
// compare them with plain < and > operators without parsing. When we DO need
// to add days or count days between, we parse to UTC midnight (see helpers
// below) to dodge local timezone / DST drama.

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** ISO 8601 calendar date, format "YYYY-MM-DD". Timezone-agnostic. */
export type ISODate = string;

/** One completed training session. Written to disk as a markdown file, but
 *  this module never touches disk — it just consumes the parsed shape. */
export type Session = {
  /** Calendar date the session happened. */
  date: ISODate;
  /** True if this session was logged during Cardio Week (the planned deload). */
  isCardioWeek: boolean;
  /** Position within the 5-day rotation (0-indexed). Null for cardio-week
   *  sessions, which don't advance the rotation. */
  rotationPosition: number | null;
};

/** A user-declared Leave of Absence — a range of days where the streak pauses. */
export type LoA = {
  /** First day of leave (inclusive). */
  start: ISODate;
  /** Last day of leave (inclusive). */
  end: ISODate;
};

// -----------------------------------------------------------------------------
// Date helpers
// -----------------------------------------------------------------------------
//
// We parse ISO dates as UTC midnight. Two "2026-03-08" strings always
// represent the same instant, and (ms diff) / 86_400_000 always yields a
// whole number of days — no DST hour-shift landmines.

function parseISO(d: ISODate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function formatISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

/** Add `n` days to an ISO date. `n` may be negative. */
export function addDays(d: ISODate, n: number): ISODate {
  const dt = parseISO(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return formatISO(dt);
}

/** Whole days from `a` to `b` (i.e. b - a). Negative if `b` is before `a`. */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = parseISO(b).getTime() - parseISO(a).getTime();
  return Math.round(ms / 86_400_000);
}

// -----------------------------------------------------------------------------
// Leave of Absence queries
// -----------------------------------------------------------------------------

/** True if `date` falls inside any LoA range (inclusive on both ends). */
export function isInLeaveOfAbsence(date: ISODate, loas: LoA[]): boolean {
  return loas.some((loa) => date >= loa.start && date <= loa.end);
}

// -----------------------------------------------------------------------------
// Cardio Week handling
// -----------------------------------------------------------------------------
//
// Cardio Week is the user's planned weekly deload. For STREAK purposes we
// treat it as an "auto-LoA" — the whole 7-day span is skipped, so a light
// cardio week doesn't break an otherwise-active streak (only 3 sessions that
// week would normally fail the ≥4 threshold).
//
// A cardio-week RANGE is derived from sessions flagged `isCardioWeek: true`.
// Consecutive cardio sessions (within 7 days of the first one) belong to the
// same cardio week. The range spans [first_cardio_date, first_cardio_date + 6].

export function deriveCardioWeekRanges(sessions: Session[]): LoA[] {
  const cardioDates = sessions
    .filter((s) => s.isCardioWeek)
    .map((s) => s.date)
    .sort();
  if (cardioDates.length === 0) return [];

  const ranges: LoA[] = [];
  let groupStart = cardioDates[0];

  for (let i = 1; i < cardioDates.length; i++) {
    const d = cardioDates[i];
    // Within 7 days of the current group's start? Still the same cardio week.
    // Otherwise close out the group and start a new one.
    if (daysBetween(groupStart, d) > 6) {
      ranges.push({ start: groupStart, end: addDays(groupStart, 6) });
      groupStart = d;
    }
  }
  ranges.push({ start: groupStart, end: addDays(groupStart, 6) });
  return ranges;
}

/** All "off-limits" ranges for streak math: user LoAs + derived Cardio Weeks. */
export function effectiveOffRanges(loas: LoA[], sessions: Session[]): LoA[] {
  return [...loas, ...deriveCardioWeekRanges(sessions)];
}

// -----------------------------------------------------------------------------
// Window helpers
// -----------------------------------------------------------------------------

/** Sessions whose date is within [startDate, endDate] (both inclusive). */
export function sessionsInRange(
  sessions: Session[],
  startDate: ISODate,
  endDate: ISODate,
): Session[] {
  return sessions.filter((s) => s.date >= startDate && s.date <= endDate);
}

/**
 * Walk backwards from `endDate` until we've collected `days` non-off days,
 * then return the inclusive [start, end] window.
 *
 * If `endDate` itself is an off day, it's still included in the span — but
 * the `days` counter only advances on non-off days. So the span may be
 * longer than `days`, but contains exactly `days` on-days.
 */
export function effectiveWindow(
  endDate: ISODate,
  days: number,
  offRanges: LoA[],
): { start: ISODate; end: ISODate } {
  let onCount = 0;
  let cursor = endDate;
  while (onCount < days) {
    if (!isInLeaveOfAbsence(cursor, offRanges)) onCount++;
    if (onCount < days) cursor = addDays(cursor, -1);
  }
  return { start: cursor, end: endDate };
}

// -----------------------------------------------------------------------------
// Streak
// -----------------------------------------------------------------------------

const STREAK_WINDOW_DAYS = 7;
/**
 * Strength sessions required inside the rolling window to count as a streak.
 *
 * Three, matching the plan's weekly success condition (one full turn of the
 * push/pull/legs rotation). This was 4, which was set when the app assumed a
 * 5-day split — on a 3-day rotation it made the streak unreachable, so the
 * Altar reported "0 days" no matter how faithfully the plan was followed.
 * Keep this in step with THREE_SESSION_WEEK_THRESHOLD in achievements.ts;
 * a streak the user can't hold while meeting their weekly goal is a lie.
 */
const STREAK_MIN_SESSIONS = 3;

/**
 * True if `date` qualifies as "in a streak": the rolling window of the last
 * 7 non-off days (ending on the most recent non-off day at or before `date`)
 * contains ≥3 strength sessions.
 *
 * If `date` itself is an off day (LoA or cardio week), we ask the question
 * as of the last non-off day before it — streak status is frozen during
 * off periods, not broken.
 */
export function isInStreakOn(
  date: ISODate,
  sessions: Session[],
  loas: LoA[],
): boolean {
  const offRanges = effectiveOffRanges(loas, sessions);

  // Back up to the most recent non-off day at or before `date`.
  let anchor = date;
  while (isInLeaveOfAbsence(anchor, offRanges)) {
    anchor = addDays(anchor, -1);
    // Guard rail: if we've walked back >10 years (e.g. malformed infinite LoA),
    // bail out and say "no streak" rather than looping forever.
    if (daysBetween(anchor, date) > 3650) return false;
  }

  const { start } = effectiveWindow(anchor, STREAK_WINDOW_DAYS, offRanges);
  const strengthSessions = sessions.filter(
    (s) => !s.isCardioWeek && s.date >= start && s.date <= anchor,
  );
  return strengthSessions.length >= STREAK_MIN_SESSIONS;
}

/**
 * Consecutive days (walking backwards from `today`, skipping off days) where
 * the streak condition has held. Returns 0 if not currently in a streak.
 */
export function computeCurrentStreak(
  sessions: Session[],
  loas: LoA[],
  today: ISODate,
): number {
  const offRanges = effectiveOffRanges(loas, sessions);

  // If today is an off day, freeze at the most recent non-off day.
  let cursor = today;
  while (isInLeaveOfAbsence(cursor, offRanges)) {
    cursor = addDays(cursor, -1);
  }

  let count = 0;
  while (isInStreakOn(cursor, sessions, loas)) {
    count++;
    // Step back one non-off day.
    cursor = addDays(cursor, -1);
    while (isInLeaveOfAbsence(cursor, offRanges)) {
      cursor = addDays(cursor, -1);
    }
    // Safety: bail if something upstream is malformed (shouldn't hit this).
    if (count > 10_000) break;
  }
  return count;
}

/**
 * Peak streak value across the user's entire history, measured by walking
 * day-by-day from the first session to `today`. Off days don't advance or
 * break the streak; they're invisible to the counter.
 */
export function bestStreakEver(
  sessions: Session[],
  loas: LoA[],
  today: ISODate,
): number {
  if (sessions.length === 0) return 0;
  const firstDate = sessions.map((s) => s.date).sort()[0];
  const offRanges = effectiveOffRanges(loas, sessions);

  let best = 0;
  let current = 0;
  let cursor = firstDate;
  while (cursor <= today) {
    if (isInLeaveOfAbsence(cursor, offRanges)) {
      // Off day — leave `current` untouched.
    } else if (isInStreakOn(cursor, sessions, loas)) {
      current++;
      if (current > best) best = current;
    } else {
      current = 0;
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}

// -----------------------------------------------------------------------------
// Deload counter
// -----------------------------------------------------------------------------
//
// "Weeks of training since last cardio week" counted in non-LoA time.
// The counter starts the day AFTER cardio week ends (or at the first session
// ever if cardio week hasn't happened yet). A "week" = 7 non-LoA days.
// Cardio week is due at 6 weeks.

export function weeksOfTrainingSinceLastDeload(
  sessions: Session[],
  loas: LoA[],
  today: ISODate,
): number {
  const cardioRanges = deriveCardioWeekRanges(sessions);
  let counterStart: ISODate;

  if (cardioRanges.length > 0) {
    // Day after the most recent cardio week ended.
    const last = cardioRanges[cardioRanges.length - 1];
    counterStart = addDays(last.end, 1);
  } else if (sessions.length > 0) {
    // No cardio week yet — count from the very first session.
    counterStart = sessions.map((s) => s.date).sort()[0];
  } else {
    return 0;
  }

  if (counterStart > today) return 0;

  // Count non-LoA days between counterStart and today (both inclusive),
  // then divide by 7. Cardio-week ranges are NOT excluded here — we're
  // measuring training weeks that precede the NEXT cardio week, and those
  // weeks include the time spent actually lifting.
  let nonLoADays = 0;
  let cursor = counterStart;
  while (cursor <= today) {
    if (!isInLeaveOfAbsence(cursor, loas)) nonLoADays++;
    cursor = addDays(cursor, 1);
  }
  return Math.floor(nonLoADays / 7);
}

export function isCardioWeekDue(
  sessions: Session[],
  loas: LoA[],
  today: ISODate,
): boolean {
  return weeksOfTrainingSinceLastDeload(sessions, loas, today) >= 6;
}

// -----------------------------------------------------------------------------
// Rotation
// -----------------------------------------------------------------------------

/**
 * Next position in the 5-day rotation. Cardio Week sessions are invisible —
 * they don't advance the rotation. If there's no history, start at position 0.
 */
export function nextRotationPosition(
  sessions: Session[],
  rotationLength = 5,
): number {
  const strengthSessions = sessions
    .filter((s) => !s.isCardioWeek && typeof s.rotationPosition === "number")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (strengthSessions.length === 0) return 0;
  const last = strengthSessions[strengthSessions.length - 1];
  return ((last.rotationPosition as number) + 1) % rotationLength;
}
