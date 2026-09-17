// Codex Imperialis — Phase 6 stats page.
//
// Six panels, each its own component:
//   1. Burden of the Flesh          — bodyweight + 7-day rolling average
//   2. Hibernation                  — sleep + 7-day rolling average + 7h ref
//   3. Encumbrance Lifted Off Soul  — weekly volume stacked by muscle group
//   4. Astartes Aspiration          — estimated 1RM progression per lift
//   5. Days of Glory                — streak ribbon with LoA shading
//   6. Week of Praise               — Cardio Week (deload) timeline
//
// This file owns the shared state: data loading, error boundary, time
// window toggle, and the grid layout. Each panel reads what it needs from
// props and handles its own empty/loading state.

import { Component, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { VaultAdapter } from "../domain/vault";
import {
  loadAllExercises,
  loadAllLoAs,
  loadAllSessions,
  loadVolumeLandmarks,
} from "../domain/vault";
import type {
  ExerciseFile,
  LoAFile,
  SessionFile,
} from "../domain/schemas";
import {
  DEFAULT_LANDMARKS,
  type Landmarks,
  type MuscleGroup,
} from "../domain/landmarks";
import { addDays, type ISODate } from "../domain/timeLogic";
import type { DisplayUnit } from "../domain/units";
import { BurdenOfTheFlesh } from "./codex/BurdenOfTheFlesh";
import { Hibernation } from "./codex/Hibernation";
import { EncumbranceLifted } from "./codex/EncumbranceLifted";
import { AstartesAspiration } from "./codex/AstartesAspiration";
import { DaysOfGlory } from "./codex/DaysOfGlory";
import { WeekOfPraise } from "./codex/WeekOfPraise";
import { BackBar } from "./BackBar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CodexAppProps = {
  adapter: VaultAdapter;
  today: ISODate;
  displayUnit: DisplayUnit;
  /** Leave the Codex and return to the Altar. CodexView turns this into the
   *  workspace navigation. Read-only view — nothing to lose, no confirm. */
  onBack: () => void;
  /** Bumped by the view whenever this leaf regains focus, so returning to
   *  the Codex re-reads the vault rather than showing what it read when the
   *  tab was first opened. */
  reloadNonce?: number;
};

/**
 * Time window choice. "all" means no filtering — useful for seeing long-term
 * bodyweight trends and strength progressions across years.
 */
export type WindowChoice = 30 | 90 | 365 | "all";

// Shape passed down to every chart panel. Pre-filtering the session list to
// the current window here means each panel doesn't re-filter on its own.
// `displayUnit` is threaded through so each chart can render axis ticks,
// tooltips, and labels in the user's chosen unit without re-reading settings.
export type PanelCommon = {
  sessions: SessionFile[];
  exercises: ExerciseFile[];
  loas: LoAFile[];
  landmarks: Record<MuscleGroup, Landmarks>;
  today: ISODate;
  window: WindowChoice;
  displayUnit: DisplayUnit;
};

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------
//
// Recharts can throw on edge-case inputs (empty domains, NaN values). Keep
// a local boundary so one busted panel doesn't blank the whole Codex.

class CodexErrorBoundary extends Component<
  { children: ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, info: { componentStack?: string | null }) {
    console.error("[Exercitium Codex] render error:", err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <div className="exercitium-codex">
          <h2>The Codex is silent.</h2>
          <pre className="exercitium-error">
            {this.state.err.message}
            {this.state.err.stack ? "\n\n" + this.state.err.stack : ""}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CodexApp(props: CodexAppProps) {
  return (
    <CodexErrorBoundary>
      <CodexAppInner {...props} />
    </CodexErrorBoundary>
  );
}

function CodexAppInner({
  adapter,
  today,
  displayUnit,
  onBack,
  reloadNonce,
}: CodexAppProps) {
  const [sessions, setSessions] = useState<SessionFile[] | null>(null);
  const [exercises, setExercises] = useState<ExerciseFile[] | null>(null);
  const [loas, setLoas] = useState<LoAFile[] | null>(null);
  const [landmarks, setLandmarks] =
    useState<Record<MuscleGroup, Landmarks>>(DEFAULT_LANDMARKS);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState<WindowChoice>(90);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ss, xs, ls, lm] = await Promise.all([
          loadAllSessions(adapter),
          loadAllExercises(adapter),
          loadAllLoAs(adapter),
          loadVolumeLandmarks(adapter),
        ]);
        if (cancelled) return;
        setSessions(ss);
        setExercises(xs);
        setLoas(ls);
        setLandmarks(lm);
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adapter, reloadNonce]);

  // Filter sessions to the window once here. Panels that want full history
  // (e.g. rolling averages that need pre-window context) can look at the
  // raw list; most panels just take this filtered view.
  const windowedSessions = useMemo(() => {
    if (!sessions) return null;
    if (window === "all") return sessions;
    const cutoff = addDays(today, -(window - 1));
    return sessions.filter((s) => s.date >= cutoff && s.date <= today);
  }, [sessions, window, today]);

  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div className="exercitium-codex">
        <BackBar onBack={onBack} />
        <h2>The Codex is silent.</h2>
        <pre className="exercitium-error">{error}</pre>
      </div>
    );
  }

  if (!sessions || !exercises || !loas || !windowedSessions) {
    return (
      <div className="exercitium-codex">
        <BackBar onBack={onBack} />
        <p className="exercitium-subtitle">Consulting the archives…</p>
      </div>
    );
  }

  const common: PanelCommon = {
    sessions: windowedSessions,
    exercises,
    loas,
    landmarks,
    today,
    window,
    displayUnit,
  };

  return (
    <div className="exercitium-codex">
      <BackBar onBack={onBack} />
      <h2>CODEX IMPERIALIS</h2>
      <p className="exercitium-subtitle">
        Every drop recorded. Every pilgrimage attested.
      </p>

      <div className="exercitium-row">
        <WindowButton value={30} label="30 days" current={window} onClick={setWindow} />
        <WindowButton value={90} label="90 days" current={window} onClick={setWindow} />
        <WindowButton value={365} label="1 year" current={window} onClick={setWindow} />
        <WindowButton value="all" label="All time" current={window} onClick={setWindow} />
      </div>

      <Panel title="Burden of the Flesh" subtitle="Bodyweight over time, with 7-day rolling average.">
        <BurdenOfTheFlesh {...common} />
      </Panel>

      <Panel title="Hibernation" subtitle="Sleep hours over time. The Emperor demands seven.">
        <Hibernation {...common} />
      </Panel>

      <Panel title="Encumbrance Lifted Off the Soul" subtitle="Weekly sets per muscle group.">
        <EncumbranceLifted {...common} />
      </Panel>

      <Panel title="Astartes Aspiration" subtitle="Estimated 1RM progression per lift (Epley formula).">
        <AstartesAspiration {...common} />
      </Panel>

      <Panel title="Days of Glory" subtitle="Every day accounted for. Pilgrimage days shaded.">
        <DaysOfGlory {...common} />
      </Panel>

      <Panel title="Week of Praise" subtitle="Cardio weeks decreed and completed.">
        <WeekOfPraise {...common} />
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------

function WindowButton({
  value,
  label,
  current,
  onClick,
}: {
  value: WindowChoice;
  label: string;
  current: WindowChoice;
  onClick: (v: WindowChoice) => void;
}) {
  const active = current === value;
  return (
    <button
      className={"exercitium-btn" + (active ? "" : " exercitium-btn-secondary")}
      onClick={() => onClick(value)}
    >
      {label}
    </button>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="exercitium-codex-panel">
      <h3 className="exercitium-codex-panel-title">{title}</h3>
      <p className="exercitium-codex-panel-subtitle">{subtitle}</p>
      <div className="exercitium-codex-panel-body">{children}</div>
    </section>
  );
}
