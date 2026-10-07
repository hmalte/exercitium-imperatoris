// First-run vault seeding.
//
// When the plugin starts and the vault has no `exercises/` folder yet, we
// create it and drop in 41 exercise definitions. Same for the two quotes
// files. This gives the user something to work with on day one without
// them having to build it by hand.
//
// **Idempotency rule:** if a file already exists, we never overwrite it.
// That matters because the user is expected to edit these files — rename
// an exercise, tweak muscle assignments, add a favorite quote, etc. A naive
// "seed on every load" would stomp those edits. So we check-then-write.
//
// If we ever need to ship *new* exercises in a later plugin version, we'd
// add a migration (add only the missing ids). For now: first-run only.

import type { VaultAdapter } from "./vault";
import {
  DIRS,
  VOLUME_LANDMARKS_PATH,
  saveExercise,
  saveQuotes,
  saveVolumeLandmarks,
} from "./vault";
import { DEFAULT_LANDMARKS } from "./landmarks";
import { SEED_EXERCISES } from "../seed/exercises";
import { serializeExerciseFile, splitFrontmatter } from "./frontmatter";
import {
  SEED_PRO_EMPEROR_QUOTES,
  SEED_DISAVOWAL_QUOTES,
} from "../seed/quotes";
import { SEED_COMPANION_QUOTES } from "../seed/companionQuotes";
import { SEED_BASE_FILES } from "../seed/bases";

// Companion-quote filename under the `quotes/` folder. Distinct from
// pro_emperor.json / disavowal.json because the SHAPE differs — these are
// keyed objects of {text, character} arrays rather than flat string arrays.
const COMPANION_QUOTES_FILENAME = "companion.json";

export type SeedReport = {
  exercisesCreated: number;
  exercisesSkipped: number;
  quotesCreated: number; // number of quote files created (0, 1, or 2)
  quotesSkipped: number;
  /** 1 if an existing companion.json was missing quote pools we now ship and
   *  we added them, 0 otherwise. Distinct from quotesCreated — the file was
   *  already there and the user's own lines were left untouched. */
  quotePoolsBackfilled: number;
  /** 1 if we just wrote the volume-landmarks file, 0 if it already existed. */
  landmarksCreated: number;
  landmarksSkipped: number;
  /** Count of .base files written (fresh seed OR regenerate). */
  basesCreated: number;
  basesSkipped: number;
};

// Seed options.
//
// `overwriteBases` is the only knob — Base files are plugin-owned (not
// user-authored), so the Settings "Regenerate Base files" button passes
// true here to force-rewrite them. Everything else stays idempotent.
export type SeedOptions = {
  overwriteBases?: boolean;
};

export async function seedVault(
  adapter: VaultAdapter,
  opts: SeedOptions = {},
): Promise<SeedReport> {
  const report: SeedReport = {
    exercisesCreated: 0,
    exercisesSkipped: 0,
    quotesCreated: 0,
    quotesSkipped: 0,
    quotePoolsBackfilled: 0,
    landmarksCreated: 0,
    landmarksSkipped: 0,
    basesCreated: 0,
    basesSkipped: 0,
  };

  // ---- Exercises --------------------------------------------------------
  await adapter.ensureFolder(DIRS.exercises);
  for (const ex of SEED_EXERCISES) {
    const path = `${DIRS.exercises}/${ex.id}.md`;
    if (await adapter.exists(path)) {
      report.exercisesSkipped++;
      continue;
    }
    await saveExercise(adapter, ex);
    report.exercisesCreated++;
  }

  // ---- Quotes -----------------------------------------------------------
  await adapter.ensureFolder(DIRS.quotes);
  const proPath = `${DIRS.quotes}/pro_emperor.json`;
  if (await adapter.exists(proPath)) {
    report.quotesSkipped++;
  } else {
    await saveQuotes(adapter, "pro_emperor", SEED_PRO_EMPEROR_QUOTES);
    report.quotesCreated++;
  }
  const disPath = `${DIRS.quotes}/disavowal.json`;
  if (await adapter.exists(disPath)) {
    report.quotesSkipped++;
  } else {
    await saveQuotes(adapter, "disavowal", SEED_DISAVOWAL_QUOTES);
    report.quotesCreated++;
  }
  // Companion-quote pool for achievement cards. Uses its own writer because
  // the JSON shape differs from pro/disavowal and saveQuotes is typed for
  // flat string arrays. Idempotent on first install; regenerate is not wired
  // separately — the user can delete the file to reseed if they ever corrupt
  // their edits.
  const companionPath = `${DIRS.quotes}/${COMPANION_QUOTES_FILENAME}`;
  if (await adapter.exists(companionPath)) {
    report.quotesSkipped++;
    // …but backfill any pool the file is missing. New achievement kinds ship
    // with new quote keys, and plain idempotency would leave an existing
    // vault permanently unable to fire them (detection skips empty pools).
    // Additive only: a key that's already present is left exactly as the
    // user wrote it, including if they emptied it deliberately.
    if (await migrateCompanionQuotes(adapter, companionPath)) {
      report.quotePoolsBackfilled++;
    }
  } else {
    await adapter.writeFile(
      companionPath,
      JSON.stringify(SEED_COMPANION_QUOTES, null, 2) + "\n",
    );
    report.quotesCreated++;
  }

  // ---- Volume landmarks -------------------------------------------------
  // Idempotent: only seed the defaults if the file isn't already present.
  // The user is expected to edit this file, so we never overwrite it.
  if (await adapter.exists(VOLUME_LANDMARKS_PATH)) {
    report.landmarksSkipped++;
  } else {
    await saveVolumeLandmarks(adapter, DEFAULT_LANDMARKS);
    report.landmarksCreated++;
  }

  // ---- Obsidian Bases files --------------------------------------------
  // Plugin-owned config, not user content. On first install we skip any
  // that already exist so a half-migrated vault isn't stomped; on explicit
  // "Regenerate" from settings we overwrite every file so bug fixes we
  // ship later actually reach the user's vault.
  await adapter.ensureFolder(DIRS.bases);
  for (const base of SEED_BASE_FILES) {
    const path = `${DIRS.bases}/${base.filename}`;
    const exists = await adapter.exists(path);
    if (exists && !opts.overwriteBases) {
      report.basesSkipped++;
      continue;
    }
    await adapter.writeFile(path, base.contents);
    report.basesCreated++;
  }

  return report;
}

/**
 * Add any companion-quote pool the on-disk file doesn't already have.
 *
 * Returns true if the file was rewritten. Deliberately conservative:
 *   - Only top-level keys present in SEED_COMPANION_QUOTES are considered.
 *   - A key already on disk is never touched — not even to merge in new
 *     lines. The user owns their edits, including deletions.
 *   - A file that won't parse is left alone entirely. Better to fire no
 *     achievement card than to overwrite something we failed to read.
 */
async function migrateCompanionQuotes(
  adapter: VaultAdapter,
  path: string,
): Promise<boolean> {
  let parsed: Record<string, unknown>;
  try {
    const raw = await adapter.readFile(path);
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    parsed = value as Record<string, unknown>;
  } catch {
    return false;
  }

  let added = false;
  for (const [key, pool] of Object.entries(SEED_COMPANION_QUOTES)) {
    if (key in parsed) continue;
    parsed[key] = pool;
    added = true;
  }
  if (!added) return false;

  await adapter.writeFile(path, JSON.stringify(parsed, null, 2) + "\n");
  return true;
}


// -----------------------------------------------------------------------------
// Apply the shipped plan
// -----------------------------------------------------------------------------
//
// seedVault never overwrites an existing exercise file, which is right for
// seeding and wrong for shipping a new programme. The plan lives in code and
// reaches a device with the plugin; the exercise FILES are vault notes and
// reach it only if note sync is working. When those two drift — new code,
// old files — the Ritual offers yesterday's workout with no hint that
// anything is stale.
//
// This closes the gap: it rewrites every exercise file's frontmatter from
// SEED_EXERCISES, so updating the plugin is enough to update the programme.
//
// What it does NOT touch:
//   - The note body. Anything written below the frontmatter is the user's,
//     and is carried across verbatim.
//   - Session files. Nothing here reads or writes training history, and
//     because exercises are referenced by id, rewriting a definition leaves
//     every logged set attached to it.
//   - Exercise files with no entry in SEED_EXERCISES. A lift invented in the
//     vault by hand is left exactly as it is.

export type PlanReport = {
  /** Files that did not exist and were written fresh. */
  created: number;
  /** Files whose frontmatter differed from the shipped plan and was replaced. */
  updated: number;
  /** Files already matching the shipped plan. */
  unchanged: number;
};

export async function applyShippedPlan(
  adapter: VaultAdapter,
): Promise<PlanReport> {
  await adapter.ensureFolder(DIRS.exercises);
  const report: PlanReport = { created: 0, updated: 0, unchanged: 0 };

  for (const ex of SEED_EXERCISES) {
    const path = `${DIRS.exercises}/${ex.id}.md`;

    if (!(await adapter.exists(path))) {
      await saveExercise(adapter, ex);
      report.created++;
      continue;
    }

    const raw = await adapter.readFile(path);
    // Preserve whatever the user has written under the frontmatter; fall
    // back to the shipped note only when the body is empty.
    const { body } = splitFrontmatter(raw);
    const notes = body.trim() ? body : ex.notes;
    const next = serializeExerciseFile({ ...ex, notes });

    // Strip carriage returns before comparing: a vault file saved on
    // Windows carries CRLF while serializeExerciseFile emits LF, so a
    // naive comparison would report every file as updated on every run.
    // Written via fromCharCode to keep an escape sequence out of the
    // source, which has been mangled by tooling more than once.
    const CR = String.fromCharCode(13);
    if (raw.split(CR).join("") === next) {
      report.unchanged++;
      continue;
    }

    await adapter.writeFile(path, next);
    report.updated++;
  }

  return report;
}
