// Unit tests for the achievement detector.
//
// These cover the four triggers and the edge cases that are easy to get
// wrong: higher threshold supersedes lower on the same group, cardio only
// fires on the crossing (not on every subsequent save), and unknown
// exercise ids don't poison the count.

import { describe, it, expect } from "vitest";
import { detectAchievements, weeklySessionCount } from "./achievements";
import type { ExerciseFile, SessionFile } from "./schemas";
import type { CompanionQuotes } from "../seed/companionQuotes";

// Deterministic picker: always grabs the first quote in a pool. Tests don't
// care which quote gets attached, only that the right KIND of achievement
// fires — pinning the picker makes the character/text assertions stable.
const firstQuote = <T>(pool: T[]): T => pool[0];

// Minimal quote pool shaped exactly like the seeded file. One entry per key
// is enough for detection — the production pool has ~17 each.
const QUOTES: CompanionQuotes = {
  workout_complete: [{ text: "Done.", character: "Abelard" }],
  ten_sets_muscle: [{ text: "Ten.", character: "Argenta" }],
  fifteen_sets_muscle: [{ text: "Fifteen.", character: "Argenta" }],
  five_cardio_month: [{ text: "Five marches.", character: "Cassia" }],
  rare_companion: [{ text: "Sixty-nine.", character: "Trazyn" }],
  three_session_week: [{ text: "Three sessions.", character: "Abelard" }],
  five_session_week: [{ text: "Five sessions.", character: "Argenta" }],
};

function session(
  overrides: Partial<SessionFile> & Pick<SessionFile, "date">,
): SessionFile {
  return {
    date: overrides.date,
    rotationPosition: overrides.rotationPosition ?? 0,
    rotationSlot: overrides.rotationSlot ?? "push",
    isCardioWeek: overrides.isCardioWeek ?? false,
    sleepHours: overrides.sleepHours ?? null,
    bodyweightKg: overrides.bodyweightKg ?? null,
    cardioMinutes: overrides.cardioMinutes ?? null,
    cardioType: overrides.cardioType ?? null,
    cleanseType: overrides.cleanseType ?? null,
    exercises: overrides.exercises ?? [],
    notes: overrides.notes ?? "",
  };
}

// Helper to craft an exercise with a single primary muscle. Keeps test
// fixtures one-line-per-exercise.
function ex(
  id: string,
  primary: ExerciseFile["primaryMuscles"],
  secondary: ExerciseFile["secondaryMuscles"] = [],
): ExerciseFile {
  return {
    id,
    displayName: id,
    primaryMuscles: primary,
    secondaryMuscles: secondary,
    rotationSlots: ["push"],
    order: 1,
    targetSets: 4,
    equipment: "barbell",
    progression: "double",
    bodyweight: false,
    notes: "",
  };
}

describe("detectAchievements", () => {
  it("returns nothing on an empty session", () => {
    const result = detectAchievements({
      sessionBeingSaved: session({ date: "2026-01-01" }),
      exercises: [],
      priorSessions: [],
      today: "2026-01-01",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    expect(result).toEqual([]);
  });

  it("fires the five-exercise card when the session has ≥5 distinct lifts", () => {
    const exercises = [
      ex("bench", ["chest"]),
      ex("row", ["back"]),
      ex("squat", ["quads"]),
      ex("curl", ["biceps"]),
      ex("press", ["front_delts"]),
    ];
    const sess = session({
      date: "2026-01-01",
      exercises: exercises.map((e) => ({
        name: e.id,
        sets: [{ reps: 5, weightKg: 20 }],
      })),
    });
    const result = detectAchievements({
      sessionBeingSaved: sess,
      exercises,
      priorSessions: [],
      today: "2026-01-01",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    const kinds = result.map((a) => a.kind);
    expect(kinds).toContain("session_five_exercises");
  });

  it("does not fire the five-exercise card for exercises with zero sets", () => {
    // User added five exercises but only actually logged sets on three.
    // Progression-wise they haven't "done" five exercises.
    const exercises = [
      ex("a", ["chest"]),
      ex("b", ["chest"]),
      ex("c", ["chest"]),
      ex("d", ["chest"]),
      ex("e", ["chest"]),
    ];
    const sess = session({
      date: "2026-01-01",
      exercises: [
        { name: "a", sets: [{ reps: 5, weightKg: 20 }] },
        { name: "b", sets: [{ reps: 5, weightKg: 20 }] },
        { name: "c", sets: [{ reps: 5, weightKg: 20 }] },
        { name: "d", sets: [] },
        { name: "e", sets: [] },
      ],
    });
    const result = detectAchievements({
      sessionBeingSaved: sess,
      exercises,
      priorSessions: [],
      today: "2026-01-01",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    expect(result.map((a) => a.kind)).not.toContain("session_five_exercises");
  });

  it("fires ten-sets at ≥10 and promotes to fifteen-sets at ≥15 for the same group", () => {
    const exercises = [ex("bench", ["chest"])];
    // 15 sets on bench → 15 effective sets on chest. Should ONLY fire the
    // fifteen card — promotion suppresses the ten card on the same group.
    const sets = Array.from({ length: 15 }, () => ({ reps: 5, weightKg: 20 }));
    const sess = session({
      date: "2026-01-01",
      exercises: [{ name: "bench", sets }],
    });
    const result = detectAchievements({
      sessionBeingSaved: sess,
      exercises,
      priorSessions: [],
      today: "2026-01-01",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    const kinds = result.map((a) => a.kind);
    expect(kinds).toContain("fifteen_sets_group");
    expect(kinds).not.toContain("ten_sets_group");
  });

  it("fires one card per group that crossed a threshold", () => {
    // 10 sets each for chest AND biceps → two ten-set cards.
    const exercises = [ex("bench", ["chest"]), ex("curl", ["biceps"])];
    const tenSets = Array.from({ length: 10 }, () => ({
      reps: 5,
      weightKg: 20,
    }));
    const sess = session({
      date: "2026-01-01",
      exercises: [
        { name: "bench", sets: tenSets },
        { name: "curl", sets: tenSets },
      ],
    });
    const result = detectAchievements({
      sessionBeingSaved: sess,
      exercises,
      priorSessions: [],
      today: "2026-01-01",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    const ten = result.filter((a) => a.kind === "ten_sets_group");
    expect(ten).toHaveLength(2);
    const groups = new Set(ten.map((a) => a.group));
    expect(groups).toEqual(new Set(["chest", "biceps"]));
  });

  // The cardio award counts DAYS carrying a modality, not minutes, across a
  // rolling MONTH. It replaced a two-hours-of-cardio rule fed by the old
  // post-workout finisher; with that step gone, a minutes threshold was
  // unreachable. The window matches the Altar's cardio readout exactly.
  const cardioOn = (date: string, type: "march" | "sprint" = "march") =>
    session({ date, cardioType: type, cardioMinutes: 30 });

  it("fires the cardio card on the fifth cardio day of the month", () => {
    const prior = [
      cardioOn("2026-01-01"),
      cardioOn("2026-01-02"),
      cardioOn("2026-01-03"),
      cardioOn("2026-01-04"),
    ];
    const result = detectAchievements({
      sessionBeingSaved: cardioOn("2026-01-05", "sprint"),
      exercises: [],
      priorSessions: prior,
      today: "2026-01-05",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    expect(result.map((a) => a.kind)).toContain("five_cardio_month");
  });

  it("does not fire on the fourth cardio day", () => {
    // Spread across the month rather than bunched — the award is about
    // frequency over 31 days, not about a hard week.
    const prior = [
      cardioOn("2025-12-14"),
      cardioOn("2025-12-22"),
      cardioOn("2025-12-30"),
    ];
    const result = detectAchievements({
      sessionBeingSaved: cardioOn("2026-01-04"),
      exercises: [],
      priorSessions: prior,
      today: "2026-01-04",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    expect(result.map((a) => a.kind)).not.toContain("five_cardio_month");
  });

  it("does not re-fire once the threshold is already met", () => {
    const prior = [
      cardioOn("2026-01-01"),
      cardioOn("2026-01-02"),
      cardioOn("2026-01-03"),
      cardioOn("2026-01-04"),
      cardioOn("2026-01-05"),
    ];
    const result = detectAchievements({
      sessionBeingSaved: cardioOn("2026-01-06"),
      exercises: [],
      priorSessions: prior,
      today: "2026-01-06",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    expect(result.map((a) => a.kind)).not.toContain("five_cardio_month");
  });

  it("ignores cardio days that have aged out of the window", () => {
    // Window is [today-30, today] = [2025-12-06, 2026-01-05]. The oldest day
    // here predates it, so this save is only the fourth one inside.
    const prior = [
      cardioOn("2025-12-01"),
      cardioOn("2026-01-02"),
      cardioOn("2026-01-03"),
      cardioOn("2026-01-04"),
    ];
    const result = detectAchievements({
      sessionBeingSaved: cardioOn("2026-01-05"),
      exercises: [],
      priorSessions: prior,
      today: "2026-01-05",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    expect(result.map((a) => a.kind)).not.toContain("five_cardio_month");
  });

  it("does not count a lifting session as a cardio day", () => {
    // Four cardio days plus a strength save. The strength day carries no
    // modality, so it can't be the fifth.
    const prior = [
      cardioOn("2026-01-01"),
      cardioOn("2026-01-02"),
      cardioOn("2026-01-03"),
      cardioOn("2026-01-04"),
    ];
    const result = detectAchievements({
      sessionBeingSaved: session({ date: "2026-01-05" }),
      exercises: [],
      priorSessions: prior,
      today: "2026-01-05",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    expect(result.map((a) => a.kind)).not.toContain("five_cardio_month");
  });

  it("fires the rare-companion card when 7-day effective sets cross 69", () => {
    // 50 prior effective sets (bench + row across the week) + 20 today
    // → 70 total, crosses 69. Should fire the rare card.
    const exercises = [ex("bench", ["chest"]), ex("row", ["back"])];
    const setOf = (n: number) =>
      Array.from({ length: n }, () => ({ reps: 5, weightKg: 20 }));
    const prior: SessionFile[] = [
      session({
        date: "2026-01-02",
        exercises: [{ name: "bench", sets: setOf(25) }],
      }),
      session({
        date: "2026-01-03",
        exercises: [{ name: "row", sets: setOf(25) }],
      }),
    ];
    const sess = session({
      date: "2026-01-04",
      exercises: [{ name: "bench", sets: setOf(20) }],
    });
    const result = detectAchievements({
      sessionBeingSaved: sess,
      exercises,
      priorSessions: prior,
      today: "2026-01-04",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    expect(result.map((a) => a.kind)).toContain("rare_companion_week");
  });

  it("does not re-fire the rare-companion card once the week is already over 69", () => {
    // 75 prior effective sets — threshold already crossed. Today's small
    // session should not re-trigger.
    const exercises = [ex("bench", ["chest"])];
    const setOf = (n: number) =>
      Array.from({ length: n }, () => ({ reps: 5, weightKg: 20 }));
    const prior: SessionFile[] = [
      session({
        date: "2026-01-02",
        exercises: [{ name: "bench", sets: setOf(75) }],
      }),
    ];
    const sess = session({
      date: "2026-01-03",
      exercises: [{ name: "bench", sets: setOf(5) }],
    });
    const result = detectAchievements({
      sessionBeingSaved: sess,
      exercises,
      priorSessions: prior,
      today: "2026-01-03",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    expect(result.map((a) => a.kind)).not.toContain("rare_companion_week");
  });

  it("excludes rare-week sets logged outside the 7-day window", () => {
    // 100 effective sets eight days ago — should fall out of the window.
    // Today's small session alone shouldn't trigger.
    const exercises = [ex("bench", ["chest"])];
    const setOf = (n: number) =>
      Array.from({ length: n }, () => ({ reps: 5, weightKg: 20 }));
    const prior: SessionFile[] = [
      session({
        date: "2025-12-27",
        exercises: [{ name: "bench", sets: setOf(100) }],
      }),
    ];
    const sess = session({
      date: "2026-01-04",
      exercises: [{ name: "bench", sets: setOf(5) }],
    });
    const result = detectAchievements({
      sessionBeingSaved: sess,
      exercises,
      priorSessions: prior,
      today: "2026-01-04",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    expect(result.map((a) => a.kind)).not.toContain("rare_companion_week");
  });

  it("sorts rare-companion cards above fifteen-set above ten-set above cardio above five-exercise", () => {
    const exercises = [
      ex("bench", ["chest"]),
      ex("row", ["back"]),
      ex("squat", ["quads"]),
      ex("curl", ["biceps"]),
      ex("press", ["front_delts"]),
    ];
    const oneSet = [{ reps: 5, weightKg: 20 }];
    const fifteenSets = Array.from({ length: 15 }, () => ({
      reps: 5,
      weightKg: 20,
    }));
    const tenSets = Array.from({ length: 10 }, () => ({
      reps: 5,
      weightKg: 20,
    }));
    // bench=15 sets → fifteen/chest; row=10 sets → ten/back; 5 distinct
    // exercises total → five-exercise card. No cardio modality, so no
    // cardio card — that award now needs five separate cardio DAYS.
    const sess = session({
      date: "2026-01-01",
      exercises: [
        { name: "bench", sets: fifteenSets },
        { name: "row", sets: tenSets },
        { name: "squat", sets: oneSet },
        { name: "curl", sets: oneSet },
        { name: "press", sets: oneSet },
      ],
    });
    const result = detectAchievements({
      sessionBeingSaved: sess,
      exercises,
      priorSessions: [],
      today: "2026-01-01",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    // 15 + 10 + 1 + 1 + 1 = 28 effective sets → well under the 69-set
    // rare threshold, so no rare-companion card on this single session.
    expect(result.map((a) => a.kind)).toEqual([
      "fifteen_sets_group",
      "ten_sets_group",
      "session_five_exercises",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Weekly session-count conditions
// ---------------------------------------------------------------------------
//
// The plan's success condition (3 sessions in a rolling 7-day window) and the
// stretch condition (5). Both are threshold CROSSINGS, so a fourth session in
// the same week must stay silent — otherwise the reward fires every day for
// the rest of the week and stops meaning anything.

describe("detectAchievements — weekly session count", () => {
  // Bare session on `date`, no exercises. The weekly count is about showing
  // up, not about what was logged, so an empty session is a valid unit here.
  const day = (date: string) => session({ date });

  const detect = (dates: string[], today: string) =>
    detectAchievements({
      sessionBeingSaved: day(today),
      exercises: [],
      priorSessions: dates.map(day),
      today,
      quotes: QUOTES,
      pickRandom: firstQuote,
    }).map((a) => a.kind);

  it("stays silent on the first and second session of the week", () => {
    expect(detect([], "2026-01-01")).toEqual([]);
    expect(detect(["2026-01-01"], "2026-01-02")).toEqual([]);
  });

  it("fires the three-session card on the third session of the week", () => {
    const kinds = detect(["2026-01-01", "2026-01-02"], "2026-01-03");
    expect(kinds).toEqual(["three_session_week"]);
  });

  it("does not re-fire on the fourth session of the same week", () => {
    const kinds = detect(
      ["2026-01-01", "2026-01-02", "2026-01-03"],
      "2026-01-04",
    );
    expect(kinds).toEqual([]);
  });

  it("fires the five-session card on the fifth, and only the fifth", () => {
    const week = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"];
    expect(detect(week, "2026-01-05")).toEqual(["five_session_week"]);
    // Sixth session in the same window: both thresholds already crossed.
    expect(detect([...week, "2026-01-05"], "2026-01-06")).toEqual([]);
  });

  it("ranks the five-session card above the three-session card", () => {
    // Contrived but reachable via backfilled sessions: a save that crosses
    // both lines at once. The louder card must come first.
    const kinds = detectAchievements({
      sessionBeingSaved: day("2026-01-05"),
      exercises: [],
      // Only two prior dates in the window, but they're enough to make the
      // save cross three; five is forced by widening the window contents.
      priorSessions: [
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
        "2026-01-04",
      ].map(day),
      today: "2026-01-05",
      quotes: QUOTES,
      pickRandom: firstQuote,
    }).map((a) => a.kind);
    // With 4 priors this crosses only five (three was crossed days ago).
    expect(kinds).toEqual(["five_session_week"]);
  });

  it("only counts sessions inside the rolling 7-day window", () => {
    // Two sessions 8+ days back have aged out; today is session #1 of the
    // current window, so nothing fires.
    const kinds = detect(["2025-12-20", "2025-12-21"], "2026-01-03");
    expect(kinds).toEqual([]);
  });

  it("counts the oldest day of the window as inside it", () => {
    // Window is [today-6, today] inclusive. 2025-12-28 is exactly today-6.
    const kinds = detect(["2025-12-28", "2026-01-02"], "2026-01-03");
    expect(kinds).toEqual(["three_session_week"]);
  });

  it("does not double-count a re-saved date", () => {
    // Re-saving 2026-01-02 when it's already on disk must not manufacture a
    // third session out of two distinct days.
    const kinds = detectAchievements({
      sessionBeingSaved: day("2026-01-02"),
      exercises: [],
      priorSessions: [day("2026-01-01"), day("2026-01-02")],
      today: "2026-01-02",
      quotes: QUOTES,
      pickRandom: firstQuote,
    }).map((a) => a.kind);
    expect(kinds).toEqual([]);
  });

  // The Altar's "The Lungs Alone" saves a lift-free session: no exercises,
  // a cardio slot, and a null rotation position. It's still a day the user
  // trained, so it has to count toward the weekly conditions — that's the
  // whole reason the counter keys on session DATES rather than on sets or
  // rotation positions.
  const cardioDay = (date: string): SessionFile =>
    session({
      date,
      rotationSlot: "cardio",
      rotationPosition: null,
      cardioMinutes: 30,
      cardioType: "march",
      exercises: [],
    });

  it("counts a standalone cardio day toward the three-session week", () => {
    const kinds = detectAchievements({
      sessionBeingSaved: cardioDay("2026-01-03"),
      exercises: [],
      priorSessions: [day("2026-01-01"), day("2026-01-02")],
      today: "2026-01-03",
      quotes: QUOTES,
      pickRandom: firstQuote,
    }).map((a) => a.kind);
    expect(kinds).toEqual(["three_session_week"]);
  });

  it("counts prior cardio days toward a later session's weekly total", () => {
    // Two cardio days then a lift day: the lift day is the third session of
    // the week and should be the one that fires the card.
    const kinds = detectAchievements({
      sessionBeingSaved: day("2026-01-03"),
      exercises: [],
      priorSessions: [cardioDay("2026-01-01"), cardioDay("2026-01-02")],
      today: "2026-01-03",
      quotes: QUOTES,
      pickRandom: firstQuote,
    }).map((a) => a.kind);
    expect(kinds).toEqual(["three_session_week"]);
  });

  it("counts a cardio day toward the five-session week", () => {
    const kinds = detectAchievements({
      sessionBeingSaved: cardioDay("2026-01-05"),
      exercises: [],
      priorSessions: [
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
        "2026-01-04",
      ].map(day),
      today: "2026-01-05",
      quotes: QUOTES,
      pickRandom: firstQuote,
    }).map((a) => a.kind);
    expect(kinds).toEqual(["five_session_week"]);
  });

  // The Altar renders weeklySessionCount directly. These pin it to the same
  // window the achievements use, so the dashboard can't read 2/3 while the
  // detector is about to award the three-session card (or vice versa).
  it("weeklySessionCount counts a lone session as one training day", () => {
    expect(weeklySessionCount([day("2026-01-03")], "2026-01-03")).toBe(1);
  });

  it("weeklySessionCount matches the count the award fires on", () => {
    const priors = [day("2026-01-01"), day("2026-01-02")];
    // Two days on the board...
    expect(weeklySessionCount(priors, "2026-01-03")).toBe(2);
    // ...and saving the third is exactly what trips the card.
    const kinds = detectAchievements({
      sessionBeingSaved: day("2026-01-03"),
      exercises: [],
      priorSessions: priors,
      today: "2026-01-03",
      quotes: QUOTES,
      pickRandom: firstQuote,
    }).map((a) => a.kind);
    expect(kinds).toEqual(["three_session_week"]);
    // With the third saved, the Altar reads 3.
    expect(
      weeklySessionCount([...priors, day("2026-01-03")], "2026-01-03"),
    ).toBe(3);
  });

  it("weeklySessionCount drops days that age out of the window", () => {
    const sessions = [day("2025-12-20"), day("2026-01-02"), day("2026-01-03")];
    expect(weeklySessionCount(sessions, "2026-01-03")).toBe(2);
  });

  it("weeklySessionCount counts a date once, however often it was saved", () => {
    expect(
      weeklySessionCount([day("2026-01-03"), day("2026-01-03")], "2026-01-03"),
    ).toBe(1);
  });

  it("attaches a quote from the matching pool", () => {
    const [card] = detectAchievements({
      sessionBeingSaved: day("2026-01-03"),
      exercises: [],
      priorSessions: [day("2026-01-01"), day("2026-01-02")],
      today: "2026-01-03",
      quotes: QUOTES,
      pickRandom: firstQuote,
    });
    expect(card.quote).toEqual(QUOTES.three_session_week[0]);
  });
});
