// CSV export of every session, flattened to one row per set.
//
// Purpose: peace-of-mind backup. The vault markdown files are already the
// source of truth, but a single flat CSV is easier to open in Excel or
// Google Sheets, email to yourself, or paste into an analysis tool. If
// Obsidian ever breaks or the plugin goes sideways, the CSV still holds
// every rep you ever logged.
//
// Row shape:
//   One row per logged set. Session-level fields (date, rotation, sleep,
//   bodyweight, cardio) repeat on every row that belongs to that session.
//   Sessions that contain NO sets (e.g. cardio-only weeks, skipped
//   rotations) still emit one "bookkeeping" row so the date isn't lost —
//   empty set columns mean "no strength work this day".
//
// Quoting: standard RFC 4180 — fields containing commas, quotes, or
// newlines are wrapped in double quotes, with internal quotes doubled.

import type { SessionFile } from "./schemas";

// Header order is stable so users can build spreadsheet formulas against
// known column positions. New columns should be appended, never inserted.
export const CSV_HEADERS = [
  "date",
  "rotation_slot",
  "rotation_position",
  "is_cardio_week",
  "sleep_hours",
  "bodyweight_kg",
  "cardio_minutes",
  "cardio_type",
  "cleanse_type",
  "exercise",
  "set_index",
  "reps",
  "weight_kg",
  "notes",
] as const;

/**
 * Flatten every session to CSV text, ready to write to disk.
 *
 * Sessions are sorted chronologically (ascending) so the CSV reads like a
 * diary. Within a session, exercises follow their stored order, and sets
 * within an exercise are numbered 1..N.
 */
export function sessionsToCsv(sessions: SessionFile[]): string {
  const sorted = [...sessions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  const rows: string[] = [];
  rows.push(CSV_HEADERS.map(csvEscape).join(","));

  for (const s of sorted) {
    // Shared session columns computed once per session, not per set.
    const sessionCols = [
      s.date,
      s.rotationSlot,
      s.rotationPosition === null ? "" : String(s.rotationPosition),
      s.isCardioWeek ? "true" : "false",
      s.sleepHours === null ? "" : String(s.sleepHours),
      s.bodyweightKg === null ? "" : String(s.bodyweightKg),
      s.cardioMinutes === null ? "" : String(s.cardioMinutes),
      s.cardioType ?? "",
      s.cleanseType ?? "",
    ];

    // Count total sets so we know whether to emit a bookkeeping row.
    const totalSets = s.exercises.reduce((n, ex) => n + ex.sets.length, 0);

    if (totalSets === 0) {
      // Bookkeeping row: exercise/set/rep columns left blank. The notes
      // column still rides along so cardio-week context isn't lost.
      rows.push(
        [...sessionCols, "", "", "", "", s.notes].map(csvEscape).join(","),
      );
      continue;
    }

    for (const ex of s.exercises) {
      let i = 0;
      for (const set of ex.sets) {
        i++;
        rows.push(
          [
            ...sessionCols,
            ex.name,
            String(i),
            String(set.reps),
            String(set.weightKg),
            s.notes,
          ]
            .map(csvEscape)
            .join(","),
        );
      }
    }
  }

  // Trailing newline: spreadsheet apps and git diffs both prefer it.
  return rows.join("\n") + "\n";
}

/**
 * Escape a single CSV cell.
 *
 * RFC 4180: wrap in double quotes if the field contains a comma, a double
 * quote, CR, or LF; double any internal quotes. Otherwise emit as-is.
 * Plain numbers and ISO dates are unaffected, so most cells pay zero
 * quoting overhead.
 */
function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
