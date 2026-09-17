// Read/write helpers for markdown-with-YAML-frontmatter files.
//
// A file on disk looks like:
//
//   ---
//   date: 2026-04-19
//   rotation_position: 3
//   ---
//   Body goes here.
//   Multiple lines of freeform markdown.
//
// This module:
//   1. Splits the raw file contents into { yaml, body }.
//   2. Parses YAML to a plain JS object.
//   3. Converts snake_case keys (on disk) to camelCase (in TS).
//   4. Does the reverse on the way back out.
//
// The snake<->camel conversion is a small chore but keeps our TS code
// idiomatic while the user sees snake_case in their files (which matches
// Obsidian Bases and general YAML convention).

import { load as yamlParse, dump as yamlDump } from "js-yaml";
import type {
  SessionFile,
  ExerciseFile,
  LoAFile,
  SessionExercise,
  SetEntry,
  RotationSlot,
  Muscle,
  Equipment,
  Progression,
  CardioType,
  CleanseType,
} from "./schemas";
import {
  CARDIO_TYPES,
  CLEANSE_TYPES,
  DEFAULT_EXERCISE_ORDER,
  DEFAULT_TARGET_SETS,
} from "./schemas";

// -----------------------------------------------------------------------------
// Raw file split / join
// -----------------------------------------------------------------------------

/**
 * Split a raw file into its YAML frontmatter object and its body string.
 * If the file has no frontmatter (no leading `---` line), returns an empty
 * object and the whole file as body.
 *
 * Matches Obsidian's behavior: only `---` on its own line delimits the block.
 */
export function splitFrontmatter(raw: string): {
  data: Record<string, unknown>;
  body: string;
} {
  // Normalize line endings so Windows-saved files work the same as Linux.
  const text = raw.replace(/\r\n/g, "\n");

  // Must start with "---" followed by newline. Otherwise no frontmatter.
  if (!text.startsWith("---\n")) {
    return { data: {}, body: text };
  }

  // Find the closing "---" on its own line.
  const closeIdx = text.indexOf("\n---", 4);
  if (closeIdx === -1) {
    return { data: {}, body: text };
  }

  const yamlText = text.slice(4, closeIdx);
  // The body starts after the closing `---` line. Strip a single leading
  // newline if present, and trim trailing whitespace so that write→read is
  // symmetric (joinFrontmatter always appends exactly one trailing newline,
  // so we strip any trailing whitespace here to match).
  let body = text.slice(closeIdx + 4);
  if (body.startsWith("\n")) body = body.slice(1);
  body = body.replace(/\s+$/, "");

  const parsed = yamlParse(yamlText);
  // yamlParse can return null/undefined for empty YAML; normalize.
  const data =
    parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  return { data, body };
}

/**
 * Build a file: `---\n<yaml>---\n<body>`. Ensures the body ends with a single
 * trailing newline so subsequent edits in Obsidian don't look weird.
 */
export function joinFrontmatter(data: Record<string, unknown>, body: string): string {
  const yamlText = yamlDump(data, {
    // Keep YAML stable across writes — don't reorder keys, don't wrap lines.
    sortKeys: false,
    lineWidth: -1,
  });
  const trimmedBody = body.replace(/\s+$/, "");
  return `---\n${yamlText}---\n${trimmedBody}\n`;
}

// -----------------------------------------------------------------------------
// Small converters
// -----------------------------------------------------------------------------
//
// These are deliberately simple — we only convert known keys, not arbitrary
// ones. That keeps unknown fields from silently leaking between YAML and TS.

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

// Parse a cardio_type YAML value to a CardioType or null. Unknown strings
// (old sessions, typos, future values we don't recognize) degrade to null
// so existing vault files keep working.
function cardioTypeOrNull(v: unknown): CardioType | null {
  if (typeof v !== "string") return null;
  return (CARDIO_TYPES as readonly string[]).includes(v) ? (v as CardioType) : null;
}

// Same treatment for cleanse_type. Sessions predating the cleanse step have
// no such key at all, which lands here as undefined and degrades to null —
// "no sauna recorded", which is the truth for those days.
function cleanseTypeOrNull(v: unknown): CleanseType | null {
  if (typeof v !== "string") return null;
  return (CLEANSE_TYPES as readonly string[]).includes(v)
    ? (v as CleanseType)
    : null;
}

// -----------------------------------------------------------------------------
// Session file
// -----------------------------------------------------------------------------

export function parseSessionFile(raw: string): SessionFile {
  const { data, body } = splitFrontmatter(raw);

  const rawExercises = Array.isArray(data.exercises) ? data.exercises : [];
  const exercises: SessionExercise[] = rawExercises.map((e: unknown) => {
    const ex = (e ?? {}) as Record<string, unknown>;
    const rawSets = Array.isArray(ex.sets) ? ex.sets : [];
    const sets: SetEntry[] = rawSets.map((s: unknown) => {
      const set = (s ?? {}) as Record<string, unknown>;
      return {
        reps: num(set.reps, 0),
        weightKg: num(set.weight_kg, 0),
      };
    });
    return { name: str(ex.name), sets };
  });

  return {
    date: str(data.date),
    rotationPosition: numOrNull(data.rotation_position),
    rotationSlot: str(data.rotation_slot, "push") as SessionFile["rotationSlot"],
    isCardioWeek: bool(data.is_cardio_week),
    sleepHours: numOrNull(data.sleep_hours),
    bodyweightKg: numOrNull(data.bodyweight_kg),
    cardioMinutes: numOrNull(data.cardio_minutes),
    cardioType: cardioTypeOrNull(data.cardio_type),
    cleanseType: cleanseTypeOrNull(data.cleanse_type),
    exercises,
    notes: body,
  };
}

export function serializeSessionFile(session: SessionFile): string {
  const data: Record<string, unknown> = {
    date: session.date,
    rotation_position: session.rotationPosition,
    rotation_slot: session.rotationSlot,
    is_cardio_week: session.isCardioWeek,
    sleep_hours: session.sleepHours,
    bodyweight_kg: session.bodyweightKg,
    cardio_minutes: session.cardioMinutes,
    cardio_type: session.cardioType,
    cleanse_type: session.cleanseType,
    exercises: session.exercises.map((ex) => ({
      name: ex.name,
      sets: ex.sets.map((s) => ({ reps: s.reps, weight_kg: s.weightKg })),
    })),
  };
  return joinFrontmatter(data, session.notes);
}

// -----------------------------------------------------------------------------
// Exercise file
// -----------------------------------------------------------------------------

export function parseExerciseFile(raw: string): ExerciseFile {
  const { data, body } = splitFrontmatter(raw);
  return {
    id: str(data.id),
    displayName: str(data.display_name),
    primaryMuscles: strArray(data.primary_muscles) as Muscle[],
    secondaryMuscles: strArray(data.secondary_muscles) as Muscle[],
    rotationSlots: strArray(data.rotation_slots) as RotationSlot[],
    // Both fields postdate the original schema, so a hand-written or
    // pre-existing file that omits them still parses — it just sorts last
    // and inherits the default set target.
    order: num(data.order, DEFAULT_EXERCISE_ORDER),
    targetSets: num(data.target_sets, DEFAULT_TARGET_SETS),
    equipment: str(data.equipment, "barbell") as Equipment,
    progression: str(data.progression, "double") as Progression,
    bodyweight: bool(data.bodyweight),
    notes: body,
  };
}

export function serializeExerciseFile(ex: ExerciseFile): string {
  const data: Record<string, unknown> = {
    id: ex.id,
    display_name: ex.displayName,
    primary_muscles: ex.primaryMuscles,
    secondary_muscles: ex.secondaryMuscles,
    rotation_slots: ex.rotationSlots,
    order: ex.order,
    target_sets: ex.targetSets,
    equipment: ex.equipment,
    progression: ex.progression,
    bodyweight: ex.bodyweight,
  };
  return joinFrontmatter(data, ex.notes);
}

// -----------------------------------------------------------------------------
// LoA file
// -----------------------------------------------------------------------------

export function parseLoAFile(raw: string): LoAFile {
  const { data, body } = splitFrontmatter(raw);
  return {
    start: str(data.start),
    end: str(data.end),
    reason: str(data.reason),
    notes: body,
  };
}

export function serializeLoAFile(loa: LoAFile): string {
  const data: Record<string, unknown> = {
    start: loa.start,
    end: loa.end,
    reason: loa.reason,
  };
  return joinFrontmatter(data, loa.notes);
}
