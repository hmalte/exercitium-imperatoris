// Back navigation, shared by every leaf view.
//
// Why this exists: entering the Ritual Chamber collapses both sidebars and
// the global theme hides Obsidian's tab bar, so a view has no visible way
// out. On desktop the user can re-open the sidebar; on mobile — the primary
// target — they're stuck until they know the swipe gesture. Every view now
// carries an explicit way back.
//
// Two shapes, one look:
//   <BackBar>        — leaves the view entirely, returning to the Altar.
//   <StepBackBar>    — retraces one step inside a multi-step flow (the
//                      Ritual), falling back to "leave" at the first step.
//
// Both render at the TOP of a view, above its heading. The label always
// names the destination rather than saying a bare "Back" — in a flow where
// a step can be reached from more than one place, "← The Altar" is honest
// and "Back" is a guess.

// A chevron rather than a text arrow: it renders identically across the
// desktop and mobile font stacks, where "←" sometimes falls back to a
// glyph that sits off the baseline.
function Chevron() {
  return (
    <svg
      className="exercitium-back-chevron"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M15 5 L8 12 L15 19"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Leave the current view and return to the Altar. Used by the Sanctum and
 * the Codex, which are read-only — there's never unsaved work to lose, so
 * this needs no confirmation.
 */
export function BackBar({
  label = "The Altar",
  onBack,
}: {
  /** Destination name, shown after the chevron. */
  label?: string;
  onBack: () => void;
}) {
  return (
    <div className="exercitium-backbar">
      <button
        type="button"
        className="exercitium-back-btn"
        onClick={onBack}
        aria-label={`Back to ${label}`}
      >
        <Chevron />
        <span>{label}</span>
      </button>
    </div>
  );
}

/**
 * One step back inside a flow.
 *
 * `hint` is optional trailing text — the Ritual uses it to reassure the
 * user that retreating out of a half-logged workout doesn't destroy it
 * (the draft autosaves and is offered back on the next open).
 */
export function StepBackBar({
  label,
  hint,
  onBack,
}: {
  label: string;
  hint?: string;
  onBack: () => void;
}) {
  return (
    <div className="exercitium-backbar">
      <button
        type="button"
        className="exercitium-back-btn"
        onClick={onBack}
        aria-label={`Back to ${label}`}
      >
        <Chevron />
        <span>{label}</span>
      </button>
      {hint && <span className="exercitium-backbar-hint">{hint}</span>}
    </div>
  );
}
