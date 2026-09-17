// Unit tests for the time/streak/rotation logic.
//
// These tests are the reason this module exists in isolation: we can assert
// behavior with plain objects, with no Obsidian or UI spin-up. If these pass,
// the hardest rules in the app are right.
//
// Naming: `describe` names the function under test; `it` describes a single
// concrete scenario. Test data is hand-crafted so the expected count / range
// is obvious from reading the setup.

import { describe, it, expect } from "vitest";
import {
  addDays,
  daysBetween,
  isInLeaveOfAbsence,
  deriveCardioWeekRanges,
  sessionsInRange,
  effectiveWindow,
  isInStreakOn,
  computeCurrentStreak,
  bestStreakEver,
  weeksOfTrainingSinceLastDeload,
  isCardioWeekDue,
  nextRotationPosition,
  type Session,
  type LoA,
} from "./timeLogic";

// Tiny factory helpers to keep test data readable.
function sess(date: string, pos: number): Session {
  return { date, isCardioWeek: false, rotationPosition: pos };
}
function cardio(date: string): Session {
  return { date, isCardioWeek: true, rotationPosition: null };
}
// A standalone cardio session ("The Lungs Alone"): a real training day that
// deliberately carries no rotation position, and — unlike a Cardio Week — is
// not a deload.
function standaloneCardio(date: string): Session {
  return { date, isCardioWeek: false, rotationPosition: null };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

describe("addDays", () => {
  it("adds positive days", () => {
    expect(addDays("2026-04-19", 5)).toBe("2026-04-24");
  });
  it("subtracts with a negative delta", () => {
    expect(addDays("2026-04-19", -3)).toBe("2026-04-16");
  });
  it("crosses a month boundary", () => {
    expect(addDays("2026-04-30", 2)).toBe("2026-05-02");
  });
  it("crosses a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("handles a leap day correctly", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("daysBetween", () => {
  it("returns 0 for the same day", () => {
    expect(daysBetween("2026-04-19", "2026-04-19")).toBe(0);
  });
  it("returns positive when b is after a", () => {
    expect(daysBetween("2026-04-19", "2026-04-22")).toBe(3);
  });
  it("returns negative when b is before a", () => {
    expect(daysBetween("2026-04-22", "2026-04-19")).toBe(-3);
  });
  it("works across a month boundary", () => {
    expect(daysBetween("2026-04-28", "2026-05-02")).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// LoA checks
// ---------------------------------------------------------------------------

describe("isInLeaveOfAbsence", () => {
  const loas: LoA[] = [
    { start: "2026-03-01", end: "2026-03-07" },
    { start: "2026-04-10", end: "2026-04-15" },
  ];

  it("returns true for a date inside a range", () => {
    expect(isInLeaveOfAbsence("2026-03-04", loas)).toBe(true);
  });
  it("is inclusive on the start boundary", () => {
    expect(isInLeaveOfAbsence("2026-03-01", loas)).toBe(true);
  });
  it("is inclusive on the end boundary", () => {
    expect(isInLeaveOfAbsence("2026-03-07", loas)).toBe(true);
  });
  it("returns false for a date before any range", () => {
    expect(isInLeaveOfAbsence("2026-02-28", loas)).toBe(false);
  });
  it("returns false for a date after all ranges", () => {
    expect(isInLeaveOfAbsence("2026-04-16", loas)).toBe(false);
  });
  it("returns false for an empty LoA list", () => {
    expect(isInLeaveOfAbsence("2026-04-01", [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cardio Week derivation
// ---------------------------------------------------------------------------

describe("deriveCardioWeekRanges", () => {
  it("returns no ranges when there are no cardio sessions", () => {
    expect(deriveCardioWeekRanges([sess("2026-04-01", 0)])).toEqual([]);
  });
  it("turns a single cardio session into a 7-day range", () => {
    expect(deriveCardioWeekRanges([cardio("2026-04-06")])).toEqual([
      { start: "2026-04-06", end: "2026-04-12" },
    ]);
  });
  it("groups consecutive cardio sessions into one range", () => {
    const ranges = deriveCardioWeekRanges([
      cardio("2026-04-06"),
      cardio("2026-04-08"),
      cardio("2026-04-10"),
    ]);
    expect(ranges).toEqual([{ start: "2026-04-06", end: "2026-04-12" }]);
  });
  it("splits cardio sessions more than 7 days apart into separate ranges", () => {
    const ranges = deriveCardioWeekRanges([
      cardio("2026-03-01"),
      cardio("2026-03-03"),
      cardio("2026-04-12"),
      cardio("2026-04-14"),
    ]);
    expect(ranges).toEqual([
      { start: "2026-03-01", end: "2026-03-07" },
      { start: "2026-04-12", end: "2026-04-18" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Ranges and windows
// ---------------------------------------------------------------------------

describe("sessionsInRange", () => {
  const sessions = [
    sess("2026-04-10", 0),
    sess("2026-04-15", 1),
    sess("2026-04-20", 2),
  ];

  it("is inclusive on both ends", () => {
    expect(sessionsInRange(sessions, "2026-04-10", "2026-04-20")).toHaveLength(3);
  });
  it("excludes sessions outside the range", () => {
    expect(sessionsInRange(sessions, "2026-04-12", "2026-04-18")).toHaveLength(1);
  });
});

describe("effectiveWindow", () => {
  it("with no off days, returns a plain N-day span", () => {
    expect(effectiveWindow("2026-04-19", 7, [])).toEqual({
      start: "2026-04-13",
      end: "2026-04-19",
    });
  });
  it("extends further back to skip past LoA days", () => {
    // LoA covers 04-14 through 04-16 (3 days). Walking back from 04-19 we
    // collect 04-19, 04-18, 04-17 (3 on-days), skip 04-14..04-16, then
    // 04-13, 04-12, 04-11, 04-10 are 4 more → 7 on-days total. start=04-10.
    const loa = [{ start: "2026-04-14", end: "2026-04-16" }];
    expect(effectiveWindow("2026-04-19", 7, loa)).toEqual({
      start: "2026-04-10",
      end: "2026-04-19",
    });
  });
});

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------

describe("isInStreakOn", () => {
  // Threshold is 3, matching one full turn of the push/pull/legs rotation.
  it("returns true with exactly 3 strength sessions in the last 7 days", () => {
    const sessions = [
      sess("2026-04-15", 0),
      sess("2026-04-17", 1),
      sess("2026-04-19", 2),
    ];
    expect(isInStreakOn("2026-04-19", sessions, [])).toBe(true);
  });
  it("returns false with only 2 sessions in the last 7 days", () => {
    const sessions = [sess("2026-04-15", 0), sess("2026-04-19", 1)];
    expect(isInStreakOn("2026-04-19", sessions, [])).toBe(false);
  });
  // A single session can never be a streak — the metric is about repetition
  // inside a week, not about having trained at all.
  it("returns false for a lone session", () => {
    expect(isInStreakOn("2026-04-19", [sess("2026-04-19", 0)], [])).toBe(false);
  });
  it("does not count cardio-week sessions toward the streak threshold", () => {
    const sessions = [
      sess("2026-04-15", 0),
      sess("2026-04-17", 1),
      cardio("2026-04-19"),
    ];
    expect(isInStreakOn("2026-04-19", sessions, [])).toBe(false);
  });
  it("extends the window past LoA days so 4 scattered sessions still qualify", () => {
    // 4 sessions across 15 calendar days, but the window skips LoA days so
    // all 4 fall inside the rolling 7-on-day window.
    const sessions = [
      sess("2026-04-05", 0),
      sess("2026-04-07", 1),
      sess("2026-04-17", 2),
      sess("2026-04-19", 3),
    ];
    const loas = [{ start: "2026-04-08", end: "2026-04-16" }];
    expect(isInStreakOn("2026-04-19", sessions, loas)).toBe(true);
  });
  it("freezes streak status during LoA, using the last non-off day", () => {
    // Today (04-19) is inside LoA. Status is the status on 04-10, which had
    // 4 sessions in the prior 7 days — so still in streak.
    const sessions = [
      sess("2026-04-04", 0),
      sess("2026-04-06", 1),
      sess("2026-04-08", 2),
      sess("2026-04-10", 3),
    ];
    const loas = [{ start: "2026-04-11", end: "2026-04-25" }];
    expect(isInStreakOn("2026-04-19", sessions, loas)).toBe(true);
  });
});

describe("computeCurrentStreak", () => {
  it("returns 0 when there are no sessions at all", () => {
    expect(computeCurrentStreak([], [], "2026-04-19")).toBe(0);
  });

  it("counts consecutive days the streak condition has held", () => {
    // 6 consecutive days of sessions: 04-14 through 04-19.
    // At a threshold of 3 the condition holds on 04-16 (3 sessions in the
    // window), 04-17 (4), 04-18 (5) and 04-19 (6). It fails on 04-15, whose
    // window catches only 04-14 and 04-15. Walking back from 04-19: 4 days.
    const sessions = [
      sess("2026-04-14", 0),
      sess("2026-04-15", 1),
      sess("2026-04-16", 2),
      sess("2026-04-17", 3),
      sess("2026-04-18", 4),
      sess("2026-04-19", 0),
    ];
    expect(computeCurrentStreak(sessions, [], "2026-04-19")).toBe(4);
  });

  it("freezes the count at the last non-LoA day when today is in LoA", () => {
    const sessions = [
      sess("2026-04-04", 0),
      sess("2026-04-06", 1),
      sess("2026-04-08", 2),
      sess("2026-04-10", 3),
    ];
    const loas = [{ start: "2026-04-11", end: "2026-04-25" }];
    // Holds on 04-10 (4 sessions in window), 04-09 (3: 04/06/08) and 04-08
    // (3: 04/06/08). Fails on 04-07, which catches only 04-04 and 04-06.
    // Streak length 3, frozen across the LoA and still reported on 04-19.
    expect(computeCurrentStreak(sessions, loas, "2026-04-19")).toBe(3);
  });
});

describe("bestStreakEver", () => {
  it("returns 0 when there are no sessions", () => {
    expect(bestStreakEver([], [], "2026-04-19")).toBe(0);
  });

  it("tracks the peak streak across history, not just the current one", () => {
    // Long streak in March (10 consecutive days of lifts → several days
    // satisfy the window condition), then a gap, then a short streak.
    const sessions = [
      sess("2026-03-01", 0),
      sess("2026-03-02", 1),
      sess("2026-03-03", 2),
      sess("2026-03-04", 3),
      sess("2026-03-05", 4),
      sess("2026-03-06", 0),
      sess("2026-03-07", 1),
      sess("2026-03-08", 2),
      sess("2026-03-09", 3),
      sess("2026-03-10", 4),
      // Long gap — current streak resets to 0.
      sess("2026-04-18", 0),
      sess("2026-04-19", 1),
    ];
    const best = bestStreakEver(sessions, [], "2026-04-19");
    // The streak condition (≥3 sessions in the rolling 7-day window) first
    // holds on 03-03, when 03-01..03-03 land in the window, and keeps
    // holding as the window slides. The last day it still holds is 03-14
    // (window 03-08..03-14 catches 03-08, 03-09 and 03-10 — exactly 3).
    // 03-03 through 03-14 inclusive = 12 days.
    expect(best).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Deload counter
// ---------------------------------------------------------------------------

describe("weeksOfTrainingSinceLastDeload", () => {
  it("returns 0 when there are no sessions yet", () => {
    expect(weeksOfTrainingSinceLastDeload([], [], "2026-04-19")).toBe(0);
  });

  it("counts weeks starting the day after the last cardio week ends", () => {
    // Cardio week spans 03-01..03-07 (derived from sessions). Counter starts
    // on 03-08. Days 03-08 through 04-19 inclusive = 43 days = 6 weeks floor.
    const sessions = [cardio("2026-03-01"), cardio("2026-03-03")];
    expect(weeksOfTrainingSinceLastDeload(sessions, [], "2026-04-19")).toBe(6);
  });

  it("counts from the first session when no cardio week has happened yet", () => {
    const sessions = [sess("2026-04-05", 0)];
    // 04-05 through 04-19 inclusive = 15 days = 2 weeks floor.
    expect(weeksOfTrainingSinceLastDeload(sessions, [], "2026-04-19")).toBe(2);
  });

  it("excludes LoA days from the week count", () => {
    // First session 03-01, today 04-19 = 50 calendar days inclusive.
    // LoA 03-10..04-09 = 31 days excluded. Remaining = 19 days = 2 weeks.
    const sessions = [sess("2026-03-01", 0)];
    const loas = [{ start: "2026-03-10", end: "2026-04-09" }];
    expect(weeksOfTrainingSinceLastDeload(sessions, loas, "2026-04-19")).toBe(2);
  });
});

describe("isCardioWeekDue", () => {
  it("is false at 5 weeks of training", () => {
    // Starting 03-16, today 04-19 = 35 days = 5 weeks.
    const sessions = [sess("2026-03-16", 0)];
    expect(isCardioWeekDue(sessions, [], "2026-04-19")).toBe(false);
  });
  it("is true at 6 weeks of training", () => {
    // Starting 03-09, today 04-19 = 42 days = 6 weeks.
    const sessions = [sess("2026-03-09", 0)];
    expect(isCardioWeekDue(sessions, [], "2026-04-19")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

describe("nextRotationPosition", () => {
  it("starts at position 0 when there is no history", () => {
    expect(nextRotationPosition([])).toBe(0);
  });
  it("advances by 1 from the last strength session", () => {
    expect(nextRotationPosition([sess("2026-04-18", 3)])).toBe(4);
  });
  it("wraps from the last slot back to position 0", () => {
    expect(nextRotationPosition([sess("2026-04-18", 4)])).toBe(0);
  });
  it("ignores cardio-week sessions so rotation resumes after deload", () => {
    const sessions = [
      sess("2026-04-10", 2),
      cardio("2026-04-12"),
      cardio("2026-04-14"),
    ];
    expect(nextRotationPosition(sessions)).toBe(3);
  });
  it("uses the latest strength session, not the earliest", () => {
    const sessions = [sess("2026-04-10", 2), sess("2026-04-15", 0)];
    expect(nextRotationPosition(sessions)).toBe(1);
  });

  // A standalone cardio session — the Altar's "The Lungs Alone" — writes a
  // null rotation position precisely so the rotation holds its place. If
  // this ever regressed, choosing cardio would silently cost the user the
  // lift day it was standing in for.
  it("holds the rotation across a standalone cardio session", () => {
    const sessions = [sess("2026-04-18", 1), standaloneCardio("2026-04-19")];
    // Pull was position 1, so legs (2) is still next — the cardio day in
    // between changed nothing.
    expect(nextRotationPosition(sessions, 3)).toBe(2);
  });

  it("holds the rotation across several standalone cardio days", () => {
    const sessions = [
      sess("2026-04-18", 1),
      standaloneCardio("2026-04-19"),
      standaloneCardio("2026-04-20"),
      standaloneCardio("2026-04-21"),
    ];
    expect(nextRotationPosition(sessions, 3)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Standalone cardio vs Cardio Week
// ---------------------------------------------------------------------------
//
// The two look similar on disk (both carry rotation_slot: cardio) and are
// distinguished only by `isCardioWeek`. That flag is load-bearing: it decides
// whether the day resets the six-weekly deload counter and whether the Altar
// declares the rotation asleep. These pin the distinction.

describe("standalone cardio is not a deload", () => {
  it("does not create a cardio-week range", () => {
    const sessions = [sess("2026-04-18", 1), standaloneCardio("2026-04-19")];
    expect(deriveCardioWeekRanges(sessions)).toEqual([]);
  });

  it("does not reset the weeks-since-deload counter", () => {
    // Eight weeks of training, with a standalone cardio day dropped in the
    // middle. If it counted as a deload, the counter would restart there and
    // the user would never be told a real deload is due.
    const sessions: Session[] = [];
    for (let w = 0; w < 8; w++) {
      sessions.push(sess(addDays("2026-01-05", w * 7), w % 3));
    }
    sessions.push(standaloneCardio("2026-02-11"));
    const today = "2026-03-02";
    expect(weeksOfTrainingSinceLastDeload(sessions, [], today)).toBe(
      weeksOfTrainingSinceLastDeload(
        sessions.filter((s) => s.rotationPosition !== null),
        [],
        today,
      ),
    );
  });

  it("still leaves a real cardio week counting as a deload", () => {
    const sessions = [sess("2026-04-18", 1), cardio("2026-04-19")];
    expect(deriveCardioWeekRanges(sessions)).toEqual([
      { start: "2026-04-19", end: "2026-04-25" },
    ]);
  });
});
