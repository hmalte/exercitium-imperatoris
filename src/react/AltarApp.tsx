// The Altar — the plugin's home view.
//
// At a glance the Altar tells the user where they stand:
//   • Which slot of the rotation comes next
//   • Current streak + best ever
//   • How many weeks of training since the last cardio week (deload countdown)
//   • Whether today is inside a Leave of Absence or a cardio week
//   • A flavor quote — pro-Emperor while in a streak, disavowal while not
//
// The Altar is mostly a read-only dashboard, plus two write-actions:
//   • "Begin the Ritual" — opens the Ritual view
//   • "Deployment to Xenos World" — declares / returns from a Leave of Absence

import { useEffect, useMemo, useState } from "react";
import type { VaultAdapter } from "../domain/vault";
import {
  endActiveLoA,
  loadAllLoAs,
  loadAllSessions,
  loadQuotes,
  saveLoA,
  saveSession,
} from "../domain/vault";
import type {
  LoAFile,
  SessionFile,
} from "../domain/schemas";
import {
  ROTATION_SLOTS,
  type RotationOrderSlot,
} from "../domain/schemas";
import {
  addDays,
  bestStreakEver,
  computeCurrentStreak,
  deriveCardioWeekRanges,
  isCardioWeekDue,
  isInLeaveOfAbsence,
  nextRotationPosition,
  weeksOfTrainingSinceLastDeload,
  type LoA,
  type Session,
} from "../domain/timeLogic";
import type { DisplayUnit } from "../domain/units";
import {
  weeklySessionCount,
  cardioDayCount,
  CARDIO_WINDOW_DAYS,
  THREE_SESSION_WEEK_THRESHOLD,
  FIVE_SESSION_WEEK_THRESHOLD,
} from "../domain/achievements";
import { CandleSkullSVG } from "./GothicSvgs";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type AltarAppProps = {
  adapter: VaultAdapter;
  /** Today in ISO format — passed in so the view is deterministic. */
  today: string;
  /** Current display unit for all weights across the plugin (kg or lb).
   *  Passed in from AltarView which reads the live plugin setting on mount. */
  displayUnit: DisplayUnit;
  /** The user's chosen rotation order (resolved from the active preset).
   *  Threaded through so the Altar's "next up" banner reflects preset
   *  changes without a re-mount. Slots include "cardio" when a preset
   *  bakes a fixed cardio day into the rotation (Sanguinary Split). */
  rotationOrder: RotationOrderSlot[];
  /** Called when the user taps "Use heretical measures" to toggle between
   *  kg and lb. The AltarView implementation persists the new value to
   *  the plugin's saved settings so other views see it next time they open. */
  onDisplayUnitChange: (unit: DisplayUnit) => void;
  /** Called when the user taps "Begin the Ritual". The AltarView turns this
   *  into the workspace navigation (opening or revealing the Ritual leaf). */
  onBeginRitual: () => void;
  /** Called when the user taps "The Lungs Alone" — a cardio-only session.
   *  Opens the Ritual in cardio_only mode: modality + minutes, no lifts.
   *  The rotation does NOT advance, but the day still counts toward the
   *  weekly 3- and 5-session conditions. */
  onBeginCardio: () => void;
  /** Bumped by the view whenever this leaf regains focus. The Altar is what
   *  you land on after a Ritual, so without this it would keep showing the
   *  streak and weekly counts from before the session was saved. */
  reloadNonce?: number;
};

// Loaded vault state. Kept in one object so we can flip from null→loaded in
// a single setState and not render half-populated panels.
type LoadedState = {
  sessions: SessionFile[];
  loas: LoAFile[];
  proEmperorQuotes: string[];
  disavowalQuotes: string[];
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AltarApp({
  adapter,
  today,
  displayUnit: initialDisplayUnit,
  rotationOrder,
  onDisplayUnitChange,
  onBeginRitual,
  onBeginCardio,
  reloadNonce,
}: AltarAppProps) {
  const [state, setState] = useState<LoadedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `reloadKey` is bumped after every write action to force the loader
  // effect to re-run, so the dashboard reflects the new file state.
  const [reloadKey, setReloadKey] = useState(0);
  // Splash overlay: covers the Altar for a brief moment on first mount
  // (candle-skull + Latin title fading over a black scrim) so the switch
  // from Obsidian chrome to the grimdark canvas reads as a deliberate
  // threshold crossing. Only shown on the very first mount of this
  // component instance — navigating away and back replays it, which is
  // fine: each return to the Altar is a ritual.
  const [splash, setSplash] = useState(true);
  // UI-only state for the deployment form.
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployDays, setDeployDays] = useState("");
  // Mirror of the plugin's displayUnit setting, so toggling feels instant
  // on the Altar without needing to re-mount the view. Any change here is
  // also sent upward to `onDisplayUnitChange` to persist to plugin data.
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>(initialDisplayUnit);

  const toggleDisplayUnit = () => {
    const next: DisplayUnit = displayUnit === "kg" ? "lb" : "kg";
    setDisplayUnit(next);
    onDisplayUnitChange(next);
  };

  // Splash timer: 600ms total — 400ms fully visible, then 200ms fade. We
  // render the overlay for the full 600ms and let a CSS opacity transition
  // handle the fade; after the timeout fires we unmount the overlay so it
  // can't accidentally eat taps.
  useEffect(() => {
    const id = window.setTimeout(() => setSplash(false), 600);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessions, loas, pro, dis] = await Promise.all([
          loadAllSessions(adapter),
          loadAllLoAs(adapter),
          loadQuotes(adapter, "pro_emperor"),
          loadQuotes(adapter, "disavowal"),
        ]);
        if (cancelled) return;
        setState({
          sessions,
          loas,
          proEmperorQuotes: pro,
          disavowalQuotes: dis,
        });
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adapter, reloadKey, reloadNonce]);

  const submitDeployment = async () => {
    const n = parseInt(deployDays, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    // Inclusive range: a 1-day deployment means end = start = today.
    const loa: LoAFile = {
      start: today,
      end: addDays(today, n - 1),
      reason: "Deployment to Xenos World",
      notes: "",
    };
    try {
      await saveLoA(adapter, loa);
      setDeployOpen(false);
      setDeployDays("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(`Failed to declare deployment: ${String(e)}`);
    }
  };

  const recallFromDeployment = async () => {
    try {
      await endActiveLoA(adapter, today);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(`Failed to recall from deployment: ${String(e)}`);
    }
  };

  // -------------------------------------------------------------------------
  // Derived readouts
  // -------------------------------------------------------------------------
  //
  // All of this is a pure function of the loaded state + today. We memoize
  // so re-renders (e.g. from hover state later on) don't re-walk the sessions.

  const derived = useMemo(() => {
    if (!state) return null;
    const tlSessions = sessionsForTimeLogic(state.sessions);
    const tlLoas = loasForTimeLogic(state.loas);

    // Rotation length now depends on which preset is active (3, 4, or 5),
    // so we pass that length through to nextRotationPosition instead of
    // letting it default to 5. Otherwise the 3-day Astartes Triptych
    // would "cycle" through invisible positions 3 and 4 before wrapping.
    const order: RotationOrderSlot[] =
      rotationOrder.length > 0
        ? rotationOrder
        : [...ROTATION_SLOTS];
    const nextPos = nextRotationPosition(state.sessions, order.length);
    const nextSlot: RotationOrderSlot = order[nextPos % order.length];

    const currentStreak = computeCurrentStreak(tlSessions, tlLoas, today);
    const best = bestStreakEver(tlSessions, tlLoas, today);
    const weeksSinceDeload = weeksOfTrainingSinceLastDeload(
      tlSessions,
      tlLoas,
      today,
    );
    const cardioDue = isCardioWeekDue(tlSessions, tlLoas, today);

    // Is today "paused"? True if inside any user LoA, or inside a derived
    // cardio-week range. Both are handled by isInLeaveOfAbsence if we hand it
    // the combined list.
    const cardioRanges = deriveCardioWeekRanges(tlSessions);
    const pausedInLoA = isInLeaveOfAbsence(today, tlLoas);
    const pausedInCardio = isInLeaveOfAbsence(today, cardioRanges);

    // The specific LoA that's active right now, if any. Used by the deployment
    // UI to show "return by" date and to offer a recall button.
    const activeLoA =
      state.loas.find((l) => today >= l.start && today <= l.end) ?? null;

    // Cardio units over the trailing month. One logged cardio session is one
    // unit, whether it was a 30-minute march or a 10-minute sprint — the
    // question this answers is "how often did I do cardio", and weighting by
    // minutes would make the harder option score lower.
    //
    // Replaced a "minutes over the last 7 sessions" readout, which counted
    // SESSIONS rather than days: across a sparse stretch it reached back
    // months and reported the total as though it were a week's work.
    const cardioUnits = cardioDayCount(
      state.sessions,
      today,
      CARDIO_WINDOW_DAYS,
    );

    // How often the flesh was cleansed in the same window.
    const cleanseCount = state.sessions.filter(
      (s) => s.date > addDays(today, -CARDIO_WINDOW_DAYS) && s.cleanseType !== null,
    ).length;

    // Training days inside the rolling weekly window — the same count the
    // 3- and 5-session achievements are judged on, so the Altar shows
    // progress toward a reward rather than leaving the user to guess.
    // Every logged day counts, cardio-only ones included.
    const weekSessions = weeklySessionCount(state.sessions, today);

    return {
      nextPos,
      nextSlot,
      currentStreak,
      best,
      weeksSinceDeload,
      cardioDue,
      pausedInLoA,
      pausedInCardio,
      activeLoA,
      cardioUnits,
      cleanseCount,
      weekSessions,
    };
  }, [state, today, rotationOrder]);

  // "Skip this rotation" — acknowledges a missed day without pretending
  // we trained. Writes a session file for today with rotationPosition set
  // to the slot we would have done, empty exercises, and a note explaining
  // what happened. Because nextRotationPosition() picks up the most recent
  // session's position + 1, this advances the rotation: tomorrow's banner
  // shows the slot AFTER the one we skipped.
  //
  // Guardrails: no-op if a session for today already exists (the user
  // already trained, or already skipped). The check uses the in-memory
  // session list we just loaded — good enough for a single-user app.
  const skipRotation = async () => {
    if (!state || !derived) return;
    if (state.sessions.some((s) => s.date === today)) {
      setError(
        "Today already has a session logged. Edit or delete it before skipping.",
      );
      return;
    }
    try {
      await saveSession(adapter, {
        date: today,
        rotationPosition: derived.nextPos,
        rotationSlot: derived.nextSlot,
        isCardioWeek: false,
        sleepHours: null,
        bodyweightKg: null,
        cardioMinutes: null,
        cardioType: null,
        cleanseType: null,
        exercises: [],
        notes: "Rotation skipped. The rest is strategic.",
      });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(`Failed to skip rotation: ${String(e)}`);
    }
  };

  // Deterministic daily quote: the day-of-year index into the chosen list,
  // so Malte sees the same quote all day and it rotates at midnight. If he's
  // in a streak we dip into pro-Emperor; otherwise into the disavowal list
  // (a small cost for inactivity — in the spirit of the theme).
  const quote = useMemo(() => {
    if (!state || !derived) return null;
    const inStreak = derived.currentStreak > 0;
    const list = inStreak ? state.proEmperorQuotes : state.disavowalQuotes;
    if (list.length === 0) return null;
    return list[dayIndex(today) % list.length];
  }, [state, derived, today]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div className="exercitium-altar-root">
        {splash && <Splash />}
        <AltarCrest />
        <h1 className="exercitium-title">EXERCITIUM IMPERATORIS</h1>
        <pre className="exercitium-error">{error}</pre>
      </div>
    );
  }

  if (!state || !derived) {
    return (
      <div className="exercitium-altar-root">
        {splash && <Splash />}
        <AltarCrest />
        <h1 className="exercitium-title">EXERCITIUM IMPERATORIS</h1>
        <p className="exercitium-subtitle">Consulting the archives…</p>
      </div>
    );
  }

  const paused = derived.pausedInLoA || derived.pausedInCardio;

  return (
    <div className="exercitium-altar-root">
      {splash && <Splash />}
      <AltarCrest />
      <h1 className="exercitium-title">EXERCITIUM IMPERATORIS</h1>
      <p className="exercitium-subtitle">In nomine Imperatoris.</p>

      {paused && (
        <div className="exercitium-altar-pause">
          {derived.pausedInLoA
            ? "Deployed to a Xenos World — the Exercitium sleeps."
            : "Cardio Week — the rotation sleeps."}
        </div>
      )}

      {/* Rites of Convalescence — shown only during an active Cardio Week.
          Cardio Week already halts the rotation; this banner layers on top
          to instruct the user on how to spend the week. Light lifts if the
          soul demands them, and doubled cardio minutes — the deload's
          whole point is active recovery, not inactivity. */}
      {derived.pausedInCardio && (
        <div className="exercitium-altar-rites">
          <h3 className="exercitium-altar-rites-heading">
            RITES OF CONVALESCENCE
          </h3>
          <p className="exercitium-altar-rites-body">
            Let the flesh heal. Should you lift, use light offerings — half
            your accustomed weight is sufficient penance. Double the
            Emperor's praise: sing with your lungs for twice the usual
            minutes, that the Omnissiah may hear you clearly.
          </p>
        </div>
      )}

      {/* Next rotation slot — or, for preset-baked cardio days, a
          CARDIO DUE banner. The Sanguinary Split's cardio day isn't a
          deload (the rotation still advances past it); the banner just
          makes clear that beginning the Ritual today launches the cardio
          flow rather than the lift menu. */}
      {derived.nextSlot === "cardio" ? (
        <div className="exercitium-banner exercitium-banner-cardio">
          <span className="exercitium-banner-slot">CARDIO DUE</span>
          <span className="exercitium-banner-position">
            next — position {derived.nextPos}
          </span>
        </div>
      ) : (
        <div className="exercitium-banner">
          <span className="exercitium-banner-slot">
            {derived.nextSlot.toUpperCase()}
          </span>
          <span className="exercitium-banner-position">
            next — position {derived.nextPos}
          </span>
        </div>
      )}

      {/* Stat readouts */}
      <div className="exercitium-altar-stats">
        {/* Weekly progress. The target escalates once the success condition
            is met, so the card keeps meaning something on a five-day week
            instead of sitting at a finished "3 / 3" for four more days. */}
        <Stat
          label="The Week's Devotion"
          value={`${derived.weekSessions} / ${
            derived.weekSessions >= THREE_SESSION_WEEK_THRESHOLD
              ? FIVE_SESSION_WEEK_THRESHOLD
              : THREE_SESSION_WEEK_THRESHOLD
          }`}
          highlight={derived.weekSessions >= THREE_SESSION_WEEK_THRESHOLD}
        />
        <Stat
          label="Current Worship"
          value={`${derived.currentStreak} ${
            derived.currentStreak === 1 ? "day" : "days"
          }`}
        />
        <Stat
          label="Most Glorious Worship"
          value={`${derived.best} ${derived.best === 1 ? "day" : "days"}`}
        />
        <Stat
          label="Emperors Mercy"
          value={
            derived.cardioDue
              ? "DUE"
              : `${derived.weeksSinceDeload} / 6 weeks`
          }
          highlight={derived.cardioDue}
        />
        <Stat
          label="Marches & Sprints (31d)"
          value={`${derived.cardioUnits}`}
        />
        <Stat
          label="Flesh Cleansed (31d)"
          value={`${derived.cleanseCount}`}
        />
      </div>

      {/* Quote */}
      {quote && (
        <blockquote className="exercitium-altar-quote">"{quote}"</blockquote>
      )}

      <button
        className="exercitium-btn exercitium-begin-btn"
        onClick={onBeginRitual}
      >
        Begin the Ritual
      </button>

      {/* Cardio-only session. Secondary to the Ritual on purpose — lifting
          is the point of the plugin — but a first-class entry point rather
          than something reached by starting a workout and backing out of it.
          Saves with a null rotation position, so the lift day that was next
          is still next; it counts toward the weekly 3/5 conditions all the
          same. Hidden during a Cardio Week, where the whole week is already
          a cardio deload and logging a one-off on top would double-count. */}
      {!derived.pausedInCardio && (
        <button
          className="exercitium-btn exercitium-btn-secondary exercitium-cardio-only-btn"
          onClick={onBeginCardio}
        >
          The Lungs Alone — cardio only
        </button>
      )}

      {/* Skip this rotation — only shown when not currently paused in an
          LoA or cardio window (those already pause the rotation). Writes
          an empty session with the current rotation position so the
          rotation advances without pretending training happened. */}
      {!paused && (
        <div className="exercitium-altar-deployment">
          <button
            className="exercitium-btn exercitium-btn-secondary"
            onClick={skipRotation}
          >
            Skip this rotation
          </button>
        </div>
      )}

      {/* Deployment controls — declare or recall from an LoA. */}
      <DeploymentPanel
        activeLoA={derived.activeLoA}
        today={today}
        formOpen={deployOpen}
        days={deployDays}
        setDays={setDeployDays}
        onOpenForm={() => setDeployOpen(true)}
        onCancelForm={() => {
          setDeployOpen(false);
          setDeployDays("");
        }}
        onSubmit={submitDeployment}
        onRecall={recallFromDeployment}
      />

      {/* Measurement toggle. The vault's raw data is always kg; this just
          flips how weights are rendered and parsed across the plugin. */}
      <HereticalMeasuresPanel
        unit={displayUnit}
        onToggle={toggleDisplayUnit}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sessionsForTimeLogic(sessions: SessionFile[]): Session[] {
  return sessions.map((s) => ({
    date: s.date,
    isCardioWeek: s.isCardioWeek,
    rotationPosition: s.rotationPosition,
  }));
}

function loasForTimeLogic(loas: LoAFile[]): LoA[] {
  return loas.map((l) => ({ start: l.start, end: l.end }));
}

// Day-of-year-ish index — good enough for "rotate the quote daily". We just
// hash the ISO date into a stable integer. Using the date string directly
// (sum of char codes) avoids leap-year / month-length awkwardness and makes
// the result perfectly deterministic across reloads.
function dayIndex(date: string): number {
  let n = 0;
  for (let i = 0; i < date.length; i++) n = (n * 31 + date.charCodeAt(i)) | 0;
  // Ensure positive so the mod is well-behaved.
  return Math.abs(n);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DeploymentPanel({
  activeLoA,
  today,
  formOpen,
  days,
  setDays,
  onOpenForm,
  onCancelForm,
  onSubmit,
  onRecall,
}: {
  activeLoA: LoAFile | null;
  today: string;
  formOpen: boolean;
  days: string;
  setDays: (v: string) => void;
  onOpenForm: () => void;
  onCancelForm: () => void;
  onSubmit: () => void;
  onRecall: () => void;
}) {
  // Currently deployed — show status + a "return" button.
  if (activeLoA) {
    // +1 because the range is inclusive on both ends.
    const daysRemaining = Math.max(
      0,
      daysDiff(today, activeLoA.end) + 1,
    );
    return (
      <div className="exercitium-altar-deployment">
        <p className="exercitium-subtitle">
          Serving the Emperor abroad. Expected return in {daysRemaining}{" "}
          {daysRemaining === 1 ? "day" : "days"} ({activeLoA.end}).
        </p>
        <button
          className="exercitium-btn exercitium-btn-secondary"
          onClick={onRecall}
        >
          Recall from Deployment
        </button>
      </div>
    );
  }

  // Not deployed — either show the entry button or the open form.
  if (!formOpen) {
    return (
      <div className="exercitium-altar-deployment">
        <button
          className="exercitium-btn exercitium-btn-secondary"
          onClick={onOpenForm}
        >
          Deployment to Xenos World
        </button>
      </div>
    );
  }

  return (
    <div className="exercitium-altar-deployment">
      <h3 className="exercitium-exercise-name">
        How many days will you serve the Emperor abroad?
      </h3>
      <div className="exercitium-row">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          placeholder="days"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="exercitium-input exercitium-input-narrow"
          autoFocus
        />
        <button className="exercitium-btn" onClick={onSubmit}>
          Embark
        </button>
        <button
          className="exercitium-btn exercitium-btn-secondary"
          onClick={onCancelForm}
        >
          Refuse the Orders
        </button>
      </div>
    </div>
  );
}

// Whole days from `a` to `b`. Uses UTC midnight parsing to match timeLogic.ts.
function daysDiff(a: string, b: string): number {
  const pa = new Date(a + "T00:00:00Z").getTime();
  const pb = new Date(b + "T00:00:00Z").getTime();
  return Math.round((pb - pa) / 86_400_000);
}

// Measurement-unit toggle shown at the bottom of the Altar. The button
// label + subtitle change depending on which unit is currently active, so
// the user always sees the "opposite" choice as an opt-in rather than a
// confusing "Use measures" that hides what it'd switch TO.
//
// The grimdark framing: kilograms are "Imperial Standard" (the orthodox,
// Mechanicus-sanctioned measurement), pounds are "heretical measures" (a
// nod to the fact that switching makes the Machine God frown). It's all
// flavor — the underlying toggle is a single boolean in plugin settings.
function HereticalMeasuresPanel({
  unit,
  onToggle,
}: {
  unit: DisplayUnit;
  onToggle: () => void;
}) {
  if (unit === "kg") {
    return (
      <div className="exercitium-altar-deployment">
        <p className="exercitium-subtitle">
          Weights measured in Imperial kilograms. The Omnissiah approves.
        </p>
        <button
          className="exercitium-btn exercitium-btn-secondary"
          onClick={onToggle}
        >
          Use heretical measures
        </button>
      </div>
    );
  }
  return (
    <div className="exercitium-altar-deployment">
      <p className="exercitium-subtitle">
        Weights measured in heretek pounds. The Mechanicus weeps in
        binharic.
      </p>
      <button
        className="exercitium-btn exercitium-btn-secondary"
        onClick={onToggle}
      >
        Repent — return to Imperial kilograms
      </button>
    </div>
  );
}

// Persistent candle above the Altar title. Stays put after the Splash fades,
// giving the landing view a lit-altar feel. The flicker comes from a CSS
// keyframe on the wrapper (subtle opacity + filter breathing); the SVG
// itself is unchanged so we can reuse it anywhere. `aria-hidden` because
// the Altar already has its title and subtitle for screen readers.
function AltarCrest() {
  return (
    <div className="exercitium-altar-crest" aria-hidden="true">
      <CandleSkullSVG size={52} className="exercitium-altar-candle" />
    </div>
  );
}

// Splash overlay — shown only on first Altar mount, for 600ms. The overlay
// absolutely-positions itself over the Altar root (see the CSS rule for
// `.exercitium-splash`), renders a candle-skull plus the plugin's Latin
// name, and fades out via a 200ms CSS opacity transition triggered by the
// `exercitium-splash-fading` class we switch in after one animation frame.
//
// A quick requestAnimationFrame is used instead of a zero-timeout so the
// browser paints the visible-state frame first — otherwise React can batch
// the initial render and the class flip, and the fade starts from "already
// transparent", making the overlay invisible.
function Splash() {
  const [fading, setFading] = useState(false);
  useEffect(() => {
    // Hold the full-opacity frame for ~400ms, then flip on the fade class.
    // The CSS transition (200ms) carries us to invisible by 600ms total.
    const id = window.setTimeout(() => setFading(true), 400);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div
      className={
        "exercitium-splash" + (fading ? " exercitium-splash-fading" : "")
      }
      aria-hidden="true"
    >
      <div className="exercitium-splash-inner">
        <CandleSkullSVG size={96} />
        <h1 className="exercitium-splash-title">EXERCITIUM IMPERATORIS</h1>
        <p className="exercitium-splash-subtitle">In nomine Imperatoris.</p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "exercitium-altar-stat" +
        (highlight ? " exercitium-altar-stat-highlight" : "")
      }
    >
      <div className="exercitium-altar-stat-value">{value}</div>
      <div className="exercitium-altar-stat-label">{label}</div>
    </div>
  );
}
