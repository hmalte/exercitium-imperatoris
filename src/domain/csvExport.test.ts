// Unit tests for the CSV export flattener.
//
// These cover the two things that tend to break:
//   1. Row emission — every set becomes exactly one row; empty sessions
//      still emit a bookkeeping row so the date isn't silently dropped.
//   2. RFC 4180 quoting — commas, quotes, and newlines in notes must not
//      corrupt the column layout.

import { describe, it, expect } from "vitest";
import { sessionsToCsv, CSV_HEADERS } from "./csvExport";
import type { SessionFile } from "./schemas";

// Small factory so tests can focus on the fields they care about without
// repeating every SessionFile property. Defaults mirror a typical strength
// session so the "happy path" test stays short.
function makeSession(overrides: Partial<SessionFile>): SessionFile {
  return {
    date: "2026-01-01",
    rotationPosition: 1,
    rotationSlot: "push",
    isCardioWeek: false,
    sleepHours: 8,
    bodyweightKg: 80,
    cardioMinutes: null,
    cardioType: null,
  cleanseType: null,
    exercises: [],
    notes: "",
    ...overrides,
  };
}

describe("sessionsToCsv", () => {
  it("emits a header row with the documented columns", () => {
    const csv = sessionsToCsv([]);
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toBe(CSV_HEADERS.join(","));
  });

  it("flattens every set to its own row", () => {
    const s = makeSession({
      exercises: [
        {
          name: "bench_press",
          sets: [
            { reps: 5, weightKg: 60 },
            { reps: 5, weightKg: 62.5 },
          ],
        },
      ],
    });
    const lines = sessionsToCsv([s]).trim().split("\n");
    // 1 header + 2 set rows
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("bench_press,1,5,60");
    expect(lines[2]).toContain("bench_press,2,5,62.5");
  });

  it("sorts sessions chronologically regardless of input order", () => {
    const a = makeSession({ date: "2026-01-10" });
    const b = makeSession({ date: "2026-01-05" });
    const csv = sessionsToCsv([a, b]);
    const firstData = csv.split("\n")[1];
    expect(firstData.startsWith("2026-01-05")).toBe(true);
  });

  it("emits one bookkeeping row for sessions with no sets", () => {
    const s = makeSession({
      date: "2026-02-01",
      isCardioWeek: true,
      rotationPosition: null,
      rotationSlot: "cardio",
      cardioMinutes: 30,
      cardioType: "sprint",
      notes: "Cardio week.",
    });
    const lines = sessionsToCsv([s]).trim().split("\n");
    expect(lines).toHaveLength(2);
    // Exercise, set index, reps, weight cells are empty — trailing columns
    // for an empty session row end with ",,,,Cardio week."
    expect(lines[1]).toContain(",,,,Cardio week.");
    expect(lines[1]).toContain("sprint");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    const s = makeSession({
      notes: 'felt "strong", hit all reps\nemperor protects',
      exercises: [
        { name: "bench_press", sets: [{ reps: 5, weightKg: 60 }] },
      ],
    });
    const csv = sessionsToCsv([s]);
    // The notes cell must be wrapped in quotes with the internal quote
    // doubled. The newline stays inside the quoted field.
    expect(csv).toContain(
      '"felt ""strong"", hit all reps\nemperor protects"',
    );
  });

  it("leaves optional numeric fields blank when null", () => {
    const s = makeSession({
      sleepHours: null,
      bodyweightKg: null,
      exercises: [
        { name: "squat", sets: [{ reps: 3, weightKg: 100 }] },
      ],
    });
    const lines = sessionsToCsv([s]).trim().split("\n");
    // date, rotation_slot, rotation_position, is_cardio_week, SLEEP, BW, ...
    // So columns 5 and 6 (index 4 and 5) should be empty strings.
    const cells = lines[1].split(",");
    expect(cells[4]).toBe("");
    expect(cells[5]).toBe("");
  });
});
