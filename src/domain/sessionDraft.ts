// Session-in-progress recovery.
//
// The Ritual is a multi-step form with real state — sleep hours, a list
// of picked exercises, sets logged against each. On mobile, a swipe or
// an incoming call can kill the view mid-workout. Before Phase 9 that
// was just lost work; now we autosave a draft to localStorage after
// every meaningful state change and offer to restore it on mount.
//
// Scope (per user decision in Phase 9):
//   - Same-date TTL only. A draft stamped 2026-04-20 is ignored if
//     loaded on 2026-04-21. Rationale: a workout that rolls past
//     midnight is either "I finished" (user taps Exit) or "I abandoned"
//     (the calendar moved on). Either way we don't want yesterday's
//     half-logged set popping up when today's Ritual opens.
//   - localStorage-backed. The plugin doesn't have a long-running
//     server process; localStorage survives a view unmount/remount and
//     an Obsidian restart, which is the failure mode we're covering.
//   - Autosave on every set log + step transition. Frequency is fine —
//     a single JSON stringify of a few dozen objects is cheap and the
//     "last 30 seconds" ghost of a dropped session is worth more than
//     the nanoseconds saved by debouncing.
//
// Not covered:
//   - Multi-day drafts (not wanted).
//   - Cross-device sync (the plugin is single-user, single-device).
//   - Restoration after a saved session. We clear the draft as soon as
//     saveSession succeeds, so a completed rite leaves no ghost.

import type { CardioType, CleanseType, SetEntry } from "./schemas";
import type { ISODate } from "./timeLogic";

// The draft shape deliberately mirrors RitualApp's in-memory state —
// not SessionFile. A SessionFile is only assembled at save time, which
// is precisely when we DON'T need a draft. The Ritual's state has
// extra fields (like which step the user is on) that SessionFile has
// no place for.
export type RitualDraft = {
  /** ISO calendar date the draft was stamped — used for the same-date
   *  TTL check on load. */
  date: ISODate;
  /** Schema version for the draft JSON. Bump when the shape changes so
   *  a stale draft from an older plugin version can be safely ignored.
   *  Bumped to 2 when the cardio finisher became the sauna cleanse: a v1
   *  draft has cardio fields where a cleanse belongs, so restoring one
   *  would put the user back into a step that no longer exists. */
  version: 2;
  /** The step the user was on when we autosaved. Used to re-enter the
   *  Ritual at the same page — if the user was picking exercises, we
   *  drop them back into the picker, not at the splash. */
  step: string;
  sleepHours: number | null;
  bodyweightKg: number | null;
  cardioMinutes: number | null;
  cardioType: CardioType | null;
  cardioQuote: string;
  /** Sauna / steam chosen on the cleanse step, or null if skipped. */
  cleanseType: CleanseType | null;
  cardioNotes: string;
  workingExercises: Array<{
    exerciseId: string;
    displayName: string;
    bodyweight: boolean;
    sets: SetEntry[];
    /** Whether the user closed this lift. Restored with the rest so a
     *  recovered session doesn't start prompting again for work that was
     *  already declared finished. */
    closed: boolean;
  }>;
};

const STORAGE_KEY = "exercitium-ritual-draft";

/**
 * Read-through for a draft belonging to today. Returns null if:
 *   - No draft exists.
 *   - Draft's stamp date doesn't match `today` (same-date TTL).
 *   - Draft's version is unknown (shape may have changed).
 *   - JSON parse throws.
 *
 * Never throws on its own — the whole point is graceful recovery, so a
 * malformed blob should be ignored, not crash the Ritual.
 */
export function loadRitualDraft(today: ISODate): RitualDraft | null {
  try {
    const raw = getStorage()?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RitualDraft;
    if (parsed.version !== 2) return null;
    if (parsed.date !== today) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persist the draft. Called from the Ritual after every set log and on
 * every step transition. Silent on error — localStorage can be disabled
 * or full, neither of which should interrupt the user's workout.
 */
export function saveRitualDraft(draft: RitualDraft): void {
  try {
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* noop — see comment above */
  }
}

/**
 * Erase any stored draft. Called:
 *   - After a successful saveSession (the rite is complete — no draft).
 *   - When the user chooses not to resume a found draft.
 *   - On end of a Sanguinary Cardio / Cardio Week session.
 */
export function clearRitualDraft(): void {
  try {
    getStorage()?.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

// Isolate the localStorage lookup so unit tests (which import this
// module before jsdom's window is ready, or which run in a non-browser
// runtime) don't blow up on the bare reference.
function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}
