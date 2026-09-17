// Seed Obsidian Bases files.
//
// Obsidian Bases is a YAML-configured table/gallery/filter view over files
// that share frontmatter. Shipping these files pre-built means the user can
// tap "Open" on any of them and get a native, filterable, sortable table
// of their sessions / LoAs / exercises without touching a line of code —
// and on mobile, where custom plugin views are the exception rather than
// the rule, Bases shines.
//
// **Important Bases constraint:** Bases reads FRONTMATTER only. It doesn't
// parse the markdown body. Our session files keep every queryable field
// (date, rotation_slot, sleep_hours, bodyweight_kg, cardio_minutes,
// cardio_type, is_cardio_week) in frontmatter, so all of this works. The
// weekly-volume stats the Codex shows are NOT in frontmatter (they come
// from parsing the per-exercise set tables), so there is no weekly-volume
// .base — that view stays in the custom Codex panel.
//
// Base-file syntax: the plain YAML/JS-style DSL Obsidian Bases ships with.
// Filters use `file.inFolder(...)` expressions; views declare a table with
// ordered columns and a sort key.
//
// Idempotency: unlike the Exercises/Quotes files, Base files are plugin-
// OWNED rather than user-editable. When the user taps "Regenerate Base
// files" in Settings, we overwrite any existing .base files so bugs we
// fix in later versions actually reach them. First-run seeding still
// skips existing files (so user tweaks survive a plugin reload).

export type BaseFileSpec = {
  /** Filename inside the `bases/` folder, with extension. */
  filename: string;
  /** Raw YAML contents written verbatim. */
  contents: string;
};

// All sessions: the primary "history" view the brief calls out. Replaces
// what would otherwise be a custom-coded history page.
const ALL_SESSIONS_BASE = `filters:
  and:
    - file.inFolder("sessions")
views:
  - type: table
    name: All Rituals
    order:
      - date
      - rotation_slot
      - sleep_hours
      - bodyweight_kg
      - cardio_minutes
      - cardio_type
      - is_cardio_week
    sort:
      - property: date
        direction: DESC
`;

// Bodyweight timeline: one row per session that recorded a bodyweight,
// chronological. Complements the Codex's Burden of the Flesh chart with a
// raw-data view the user can sort/filter in-place.
const BODYWEIGHT_TIMELINE_BASE = `filters:
  and:
    - file.inFolder("sessions")
    - bodyweight_kg != null
views:
  - type: table
    name: Bodyweight log
    order:
      - date
      - bodyweight_kg
    sort:
      - property: date
        direction: DESC
`;

// Sleep timeline: same idea, but for sleep hours.
const SLEEP_TIMELINE_BASE = `filters:
  and:
    - file.inFolder("sessions")
    - sleep_hours != null
views:
  - type: table
    name: Hours in the hibernation chamber
    order:
      - date
      - sleep_hours
    sort:
      - property: date
        direction: DESC
`;

// Cardio finisher log: every session that actually did the cardio finisher,
// with modality and minutes. Skipped sessions drop out.
const CARDIO_LOG_BASE = `filters:
  and:
    - file.inFolder("sessions")
    - cardio_minutes != null
views:
  - type: table
    name: Cardio offerings
    order:
      - date
      - cardio_type
      - cardio_minutes
      - rotation_slot
    sort:
      - property: date
        direction: DESC
`;

// Leaves of Absence: pilgrimage ledger. Uses start/end dates from LoA
// frontmatter — the reason column tells the story at a glance.
const ALL_LOAS_BASE = `filters:
  and:
    - file.inFolder("loas")
views:
  - type: table
    name: Pilgrimages
    order:
      - start
      - end
      - reason
    sort:
      - property: start
        direction: DESC
`;

// Exercise library: every movement in the Imperium's canon. Useful as a
// quick reference and for the user to edit fields on (muscle mappings,
// rotation slots, progression mode).
const ALL_EXERCISES_BASE = `filters:
  and:
    - file.inFolder("exercises")
views:
  - type: table
    name: The Imperial Canon
    order:
      - display_name
      - rotation_slots
      - primary_muscles
      - equipment
      - progression
      - bodyweight
    sort:
      - property: display_name
        direction: ASC
`;

export const SEED_BASE_FILES: BaseFileSpec[] = [
  { filename: "all-sessions.base", contents: ALL_SESSIONS_BASE },
  { filename: "bodyweight-timeline.base", contents: BODYWEIGHT_TIMELINE_BASE },
  { filename: "sleep-timeline.base", contents: SLEEP_TIMELINE_BASE },
  { filename: "cardio-log.base", contents: CARDIO_LOG_BASE },
  { filename: "all-loas.base", contents: ALL_LOAS_BASE },
  { filename: "all-exercises.base", contents: ALL_EXERCISES_BASE },
];
