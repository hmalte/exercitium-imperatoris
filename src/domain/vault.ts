// Vault I/O — reading and writing records to disk.
//
// Why an "adapter" interface:
//   The domain code here doesn't know or care whether it's talking to the
//   Obsidian Vault API, a fake in-memory filesystem, or something else.
//   It only knows the four methods in `VaultAdapter` below. That means:
//     - Tests can use InMemoryVaultAdapter (no Obsidian required).
//     - The real plugin uses ObsidianVaultAdapter (defined in src/obsidian/).
//     - If Obsidian's API ever changes, we only edit one small file.
//
// Directory layout inside the vault:
//   sessions/<YYYY-MM-DD>.md
//   exercises/<id>.md
//   loas/<start>_to_<end>.md
//   quotes/pro_emperor.json
//   quotes/disavowal.json

import type { SessionFile, ExerciseFile, LoAFile } from "./schemas";
import {
  parseSessionFile,
  serializeSessionFile,
  parseExerciseFile,
  serializeExerciseFile,
  parseLoAFile,
  serializeLoAFile,
} from "./frontmatter";
import {
  DEFAULT_LANDMARKS,
  parseVolumeLandmarks,
  serializeVolumeLandmarks,
  type Landmarks,
  type MuscleGroup,
} from "./landmarks";
import { addDays, type ISODate } from "./timeLogic";

// -----------------------------------------------------------------------------
// Directory constants
// -----------------------------------------------------------------------------

export const DIRS = {
  sessions: "sessions",
  exercises: "exercises",
  loas: "loas",
  quotes: "quotes",
  settings: "settings",
  bases: "bases",
} as const;

export const VOLUME_LANDMARKS_PATH = `${DIRS.settings}/volume-landmarks.md`;

// -----------------------------------------------------------------------------
// The adapter interface
// -----------------------------------------------------------------------------
//
// Intentionally minimal. If we ever need more (rename, delete), we add it
// here and every adapter must implement it.

export interface VaultAdapter {
  /** True if a file or folder exists at the given path. */
  exists(path: string): Promise<boolean>;
  /** Create a folder (and its parents if needed). No-op if it already exists. */
  ensureFolder(path: string): Promise<void>;
  /** List every file path directly inside a folder. Returns [] if absent. */
  listFiles(folder: string): Promise<string[]>;
  /** Read a file's contents as a string. Throws if the file doesn't exist. */
  readFile(path: string): Promise<string>;
  /** Write a file, creating it or overwriting. */
  writeFile(path: string, contents: string): Promise<void>;
  /** Delete a file. No-op if it doesn't exist. */
  deleteFile(path: string): Promise<void>;
}

// -----------------------------------------------------------------------------
// Session CRUD
// -----------------------------------------------------------------------------

export async function saveSession(
  adapter: VaultAdapter,
  session: SessionFile,
): Promise<void> {
  await adapter.ensureFolder(DIRS.sessions);
  const path = `${DIRS.sessions}/${session.date}.md`;
  await adapter.writeFile(path, serializeSessionFile(session));
}

export async function loadAllSessions(
  adapter: VaultAdapter,
): Promise<SessionFile[]> {
  if (!(await adapter.exists(DIRS.sessions))) return [];
  const paths = await adapter.listFiles(DIRS.sessions);
  const mdPaths = paths.filter((p) => p.endsWith(".md"));
  const sessions: SessionFile[] = [];
  for (const p of mdPaths) {
    const raw = await adapter.readFile(p);
    sessions.push(parseSessionFile(raw));
  }
  // Sort chronologically — callers that care about order get it for free.
  sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return sessions;
}

// -----------------------------------------------------------------------------
// Exercise CRUD
// -----------------------------------------------------------------------------

export async function saveExercise(
  adapter: VaultAdapter,
  ex: ExerciseFile,
): Promise<void> {
  await adapter.ensureFolder(DIRS.exercises);
  const path = `${DIRS.exercises}/${ex.id}.md`;
  await adapter.writeFile(path, serializeExerciseFile(ex));
}

export async function loadAllExercises(
  adapter: VaultAdapter,
): Promise<ExerciseFile[]> {
  if (!(await adapter.exists(DIRS.exercises))) return [];
  const paths = await adapter.listFiles(DIRS.exercises);
  const mdPaths = paths.filter((p) => p.endsWith(".md"));
  const exercises: ExerciseFile[] = [];
  for (const p of mdPaths) {
    const raw = await adapter.readFile(p);
    exercises.push(parseExerciseFile(raw));
  }
  // Sort by the planned `order` first so the Ritual's menu reads as the
  // workout in the sequence it's meant to be performed. Id breaks ties,
  // which keeps files that share an order (or omit it entirely and fall
  // back to DEFAULT_EXERCISE_ORDER) in a stable, predictable position.
  exercises.sort((a, b) =>
    a.order !== b.order
      ? a.order - b.order
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0,
  );
  return exercises;
}

// -----------------------------------------------------------------------------
// LoA CRUD
// -----------------------------------------------------------------------------

export async function saveLoA(
  adapter: VaultAdapter,
  loa: LoAFile,
): Promise<void> {
  await adapter.ensureFolder(DIRS.loas);
  const path = `${DIRS.loas}/${loa.start}_to_${loa.end}.md`;
  await adapter.writeFile(path, serializeLoAFile(loa));
}

export async function loadAllLoAs(adapter: VaultAdapter): Promise<LoAFile[]> {
  if (!(await adapter.exists(DIRS.loas))) return [];
  const paths = await adapter.listFiles(DIRS.loas);
  const mdPaths = paths.filter((p) => p.endsWith(".md"));
  const loas: LoAFile[] = [];
  for (const p of mdPaths) {
    const raw = await adapter.readFile(p);
    loas.push(parseLoAFile(raw));
  }
  loas.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return loas;
}

/**
 * End the LoA that's currently active on `today` (if any).
 *   - If cutting it short to yesterday still leaves it valid (end >= start),
 *     we rewrite the file with the new end date. Because the filename
 *     encodes start+end, we delete the old file and write a new one.
 *   - If shortening would make end < start (user declared a deployment and
 *     immediately recalled it), we just delete the file.
 * No-op if no LoA is active today.
 */
export async function endActiveLoA(
  adapter: VaultAdapter,
  today: ISODate,
): Promise<void> {
  const loas = await loadAllLoAs(adapter);
  const active = loas.find((l) => today >= l.start && today <= l.end);
  if (!active) return;

  const oldPath = `${DIRS.loas}/${active.start}_to_${active.end}.md`;
  const newEnd = addDays(today, -1);

  await adapter.deleteFile(oldPath);

  if (newEnd >= active.start) {
    const updated: LoAFile = { ...active, end: newEnd };
    const newPath = `${DIRS.loas}/${updated.start}_to_${updated.end}.md`;
    await adapter.writeFile(newPath, serializeLoAFile(updated));
  }
}

// -----------------------------------------------------------------------------
// Quotes
// -----------------------------------------------------------------------------
//
// Quotes live in plain JSON arrays, not YAML. They're data the user can edit
// freely (add favorites, remove ones that don't land) and there's no reason
// to wrap each line in its own markdown file.

export async function loadQuotes(
  adapter: VaultAdapter,
  kind: "pro_emperor" | "disavowal",
): Promise<string[]> {
  const path = `${DIRS.quotes}/${kind}.json`;
  if (!(await adapter.exists(path))) return [];
  const raw = await adapter.readFile(path);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((q) => typeof q === "string") : [];
  } catch {
    // Malformed JSON — surface an empty list rather than crashing the plugin.
    // The user can fix the file; we don't lose any sessions over a typo.
    return [];
  }
}

export async function saveQuotes(
  adapter: VaultAdapter,
  kind: "pro_emperor" | "disavowal",
  quotes: string[],
): Promise<void> {
  await adapter.ensureFolder(DIRS.quotes);
  const path = `${DIRS.quotes}/${kind}.json`;
  await adapter.writeFile(path, JSON.stringify(quotes, null, 2) + "\n");
}

/**
 * Load the companion-quote pool used by achievement cards. Returns an empty
 * pool shape if the file is missing or malformed — detection runs on every
 * save, so a missing file mustn't crash the Ritual.
 */
export async function loadCompanionQuotes(
  adapter: VaultAdapter,
): Promise<import("../seed/companionQuotes").CompanionQuotes> {
  const empty: import("../seed/companionQuotes").CompanionQuotes = {
    workout_complete: [],
    ten_sets_muscle: [],
    fifteen_sets_muscle: [],
    five_cardio_month: [],
    rare_companion: [],
    three_session_week: [],
    five_session_week: [],
  };
  const path = `${DIRS.quotes}/companion.json`;
  if (!(await adapter.exists(path))) return empty;
  try {
    const raw = await adapter.readFile(path);
    const parsed = JSON.parse(raw);
    return {
      workout_complete: pickArray(parsed.workout_complete),
      ten_sets_muscle: pickArray(parsed.ten_sets_muscle),
      fifteen_sets_muscle: pickArray(parsed.fifteen_sets_muscle),
      five_cardio_month: pickArray(parsed.five_cardio_month),
      rare_companion: pickArray(parsed.rare_companion),
      // Added after the first vaults shipped. pickArray yields [] for a
      // missing key, and detection skips any pool that's empty — so an
      // un-migrated companion.json degrades to "no card" rather than
      // throwing mid-save. `migrateCompanionQuotes` backfills them.
      three_session_week: pickArray(parsed.three_session_week),
      five_session_week: pickArray(parsed.five_session_week),
    };
  } catch {
    return empty;
  }
}

// Narrow an unknown JSON value down to an array of {text, character}. Any
// entry that doesn't match the shape is silently dropped — malformed
// quotes shouldn't be able to poison the detection path.
function pickArray(
  value: unknown,
): { text: string; character: string }[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (q): q is { text: string; character: string } =>
      typeof q === "object" &&
      q !== null &&
      typeof (q as { text?: unknown }).text === "string" &&
      typeof (q as { character?: unknown }).character === "string",
  );
}

// -----------------------------------------------------------------------------
// Volume landmarks
// -----------------------------------------------------------------------------
//
// One markdown file at `settings/volume-landmarks.md` holds every group's
// MEV/MAV/MRV triple. If the file doesn't exist we return the in-code
// defaults — so the Sanctum paints correct colors even before the seed step
// has had a chance to write anything. Any field the user omits in their own
// copy also falls back to that group's default (see parseVolumeLandmarks).

export async function loadVolumeLandmarks(
  adapter: VaultAdapter,
): Promise<Record<MuscleGroup, Landmarks>> {
  if (!(await adapter.exists(VOLUME_LANDMARKS_PATH))) {
    return DEFAULT_LANDMARKS;
  }
  const raw = await adapter.readFile(VOLUME_LANDMARKS_PATH);
  return parseVolumeLandmarks(raw);
}

export async function saveVolumeLandmarks(
  adapter: VaultAdapter,
  landmarks: Record<MuscleGroup, Landmarks>,
): Promise<void> {
  await adapter.ensureFolder(DIRS.settings);
  await adapter.writeFile(
    VOLUME_LANDMARKS_PATH,
    serializeVolumeLandmarks(landmarks),
  );
}

// -----------------------------------------------------------------------------
// InMemoryVaultAdapter — a test double
// -----------------------------------------------------------------------------
//
// Lives in this file (not tucked behind a test-only suffix) because it's
// useful anywhere you need to dry-run vault operations without touching disk.

export class InMemoryVaultAdapter implements VaultAdapter {
  private files = new Map<string, string>();
  private folders = new Set<string>();

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async ensureFolder(path: string): Promise<void> {
    this.folders.add(path);
  }

  async listFiles(folder: string): Promise<string[]> {
    const prefix = folder.endsWith("/") ? folder : folder + "/";
    return Array.from(this.files.keys()).filter(
      (p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"),
    );
  }

  async readFile(path: string): Promise<string> {
    const f = this.files.get(path);
    if (f === undefined) throw new Error(`InMemoryVault: no file at "${path}"`);
    return f;
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.files.set(path, contents);
    // Track parent folder so `exists(folder)` returns true.
    const slash = path.lastIndexOf("/");
    if (slash > 0) this.folders.add(path.slice(0, slash));
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
  }

  /** Test helper: peek at what's been written. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.files.entries());
  }
}
