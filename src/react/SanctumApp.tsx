// The Sanctum — a per-muscle readout of what you've trained.
//
// Two numbers per muscle, side by side:
//   • SETS — effective set count (1.0 primary, 0.5 secondary). The "how
//     many times did this muscle get hit" number. This is what will drive
//     the body heatmap colors in Phase 5b.
//   • TONNAGE (kg) — total weight × reps through this muscle, same
//     primary/secondary weighting. Bodyweight exercises get their tonnage
//     estimated with the user's last recorded bodyweight.
//
// A window toggle (Solar Week / Solar Month / Solar Year — 7/31/365 days)
// recomputes the rollup. Click a column header to sort by that column.

import { Component, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { VaultAdapter } from "../domain/vault";
import {
  loadAllExercises,
  loadAllSessions,
  loadVolumeLandmarks,
} from "../domain/vault";
import type { ExerciseFile, Muscle, SessionFile } from "../domain/schemas";
import { computeMuscleStats, type MuscleStats } from "../domain/volume";
import {
  classifyVolume,
  weeklyAverage,
  DEFAULT_LANDMARKS,
  MUSCLE_TO_GROUP,
  type Landmarks,
  type MuscleGroup,
  type VolumeStatus,
} from "../domain/landmarks";
import {
  MUSCLE_QUOTES,
  UNTRAINED_FALLBACK_QUOTE,
  mostWorkedMuscle,
} from "../domain/muscleQuotes";
import { AstartesBodyMap } from "./AstartesBodyMap";
import { BackBar } from "./BackBar";
import { type DisplayUnit, kgToDisplay, unitLabel } from "../domain/units";

export type SanctumAppProps = {
  adapter: VaultAdapter;
  today: string;
  displayUnit: DisplayUnit;
  /** Leave the Sanctum and return to the Altar. SanctumView turns this into
   *  the workspace navigation. Read-only view, so there's nothing to lose
   *  and no confirmation. */
  onBack: () => void;
  /** Bumped by the view whenever this leaf regains focus. Included in the
   *  loader's dependencies so returning to a dashboard re-reads the vault
   *  instead of showing whatever it read when the tab was first opened. */
  reloadNonce?: number;
};

type WindowChoice = 7 | 31 | 365;
type SortKey = "muscle" | "sets" | "tonnageKg" | "status";
type SortDir = "asc" | "desc";

// The row we render — a MuscleStats plus the group-level volume-status
// info. Grouping is what makes "back" and "lats" share a pill: we sum
// their sets into one weekly-average number and classify that once.
type SanctumRow = MuscleStats & {
  group: MuscleGroup;
  groupWeeklySets: number;
  status: VolumeStatus;
};

// For comparison when sorting by status — lower index = worse status.
// Under-MEV first so the user instantly sees muscles that need volume.
const STATUS_SORT_RANK: Record<VolumeStatus, number> = {
  under_mev: 0,
  over_mrv: 1,
  mav_mrv: 2,
  mev_mav: 3,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

// Without an error boundary, a render crash inside the Sanctum tree (e.g.
// a third-party library throwing on an edge-case input) takes out the whole
// view and leaves the user staring at a blank pane with no clue why. This
// catches the throw, prints the message + stack, and keeps the rest of
// Obsidian happy.
class SanctumErrorBoundary extends Component<
  { children: ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, info: { componentStack?: string | null }) {
    // Landing this in the devtools console makes copy-paste diagnosis easy.
    console.error("[Exercitium Sanctum] render error:", err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <div className="exercitium-sanctum">
          <h2>The sanctum is silent.</h2>
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

export function SanctumApp(props: SanctumAppProps) {
  return (
    <SanctumErrorBoundary>
      <SanctumAppInner {...props} />
    </SanctumErrorBoundary>
  );
}

function SanctumAppInner({
  adapter,
  today,
  displayUnit,
  onBack,
  reloadNonce,
}: SanctumAppProps) {
  const [sessions, setSessions] = useState<SessionFile[] | null>(null);
  const [exercises, setExercises] = useState<ExerciseFile[] | null>(null);
  // Start with the in-code defaults so the first render already has colored
  // pills. The useEffect below replaces these with the user's edited values
  // once the markdown file has been read.
  const [landmarks, setLandmarks] =
    useState<Record<MuscleGroup, Landmarks>>(DEFAULT_LANDMARKS);
  const [error, setError] = useState<string | null>(null);

  const [windowDays, setWindowDays] = useState<WindowChoice>(31);
  const [sortKey, setSortKey] = useState<SortKey>("sets");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedSessions, loadedExercises, loadedLandmarks] =
          await Promise.all([
            loadAllSessions(adapter),
            loadAllExercises(adapter),
            loadVolumeLandmarks(adapter),
          ]);
        if (cancelled) return;
        setSessions(loadedSessions);
        setExercises(loadedExercises);
        setLandmarks(loadedLandmarks);
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adapter, reloadNonce]);

  const baseRows = useMemo(() => {
    if (!sessions || !exercises) return null;
    return computeMuscleStats(sessions, exercises, windowDays, today);
  }, [sessions, exercises, windowDays, today]);

  // Aggregate per-muscle sets into per-group sets, then classify each group
  // against its landmark triple. Doing this at the group level (not per
  // muscle) matches how MEV/MAV/MRV are defined — you don't program lats
  // volume separately from back volume.
  const rows = useMemo<SanctumRow[] | null>(() => {
    if (!baseRows) return null;
    const groupSets = new Map<MuscleGroup, number>();
    for (const r of baseRows) {
      const g = MUSCLE_TO_GROUP[r.muscle];
      groupSets.set(g, (groupSets.get(g) ?? 0) + r.sets);
    }
    return baseRows.map((r) => {
      const group = MUSCLE_TO_GROUP[r.muscle];
      const groupWeeklySets = weeklyAverage(
        groupSets.get(group) ?? 0,
        windowDays,
      );
      return {
        ...r,
        group,
        groupWeeklySets,
        status: classifyVolume(groupWeeklySets, landmarks[group]),
      };
    });
  }, [baseRows, landmarks, windowDays]);

  // Per-group weekly sets — a flat Record for the bodymap to classify each
  // lib-muscle region against its dominant group's landmarks. Derived from
  // `rows` rather than recomputed so the two views can't drift.
  const groupWeeklySets = useMemo<Record<MuscleGroup, number>>(() => {
    const out = {} as Record<MuscleGroup, number>;
    // Seed every group with 0 so the bodymap has a value for untrained
    // groups too (classifyVolume will then correctly bucket them as
    // under_mev → grey stone).
    for (const g of Object.values(MUSCLE_TO_GROUP)) out[g] = 0;
    if (!rows) return out;
    // Every row carries groupWeeklySets for its group already; copy once
    // per group (multiple rows share a group, but the value is identical).
    for (const r of rows) out[r.group] = r.groupWeeklySets;
    return out;
  }, [rows]);

  const sortedRows = useMemo(() => {
    if (!rows) return null;
    // Copy so we don't mutate the memoized list.
    const copy = [...rows];
    copy.sort((a, b) => compareRows(a, b, sortKey, sortDir));
    return copy;
  }, [rows, sortKey, sortDir]);

  // Pick the quote to display above the bodymap. Strategy:
  //   1. Find the muscle with the most effective sets in the window.
  //   2. Rotate through that muscle's 3 quotes by day — so the user sees a
  //      stable line across a single day, but a fresh one tomorrow.
  //   3. Fall back to the untrained message if nothing has been trained.
  const featuredQuote = useMemo(() => {
    if (!rows) return null;
    const top = mostWorkedMuscle(rows);
    if (!top) return UNTRAINED_FALLBACK_QUOTE;
    const pool = MUSCLE_QUOTES[top];
    return pool[dayIndex(today) % pool.length];
  }, [rows, today]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div className="exercitium-sanctum">
        <BackBar onBack={onBack} />
        <h2>The sanctum is silent.</h2>
        <pre className="exercitium-error">{error}</pre>
      </div>
    );
  }

  if (!sortedRows) {
    return (
      <div className="exercitium-sanctum">
        <BackBar onBack={onBack} />
        <p className="exercitium-subtitle">Consulting the archives…</p>
      </div>
    );
  }

  return (
    <div className="exercitium-sanctum">
      <BackBar onBack={onBack} />
      <h2>THE SANCTUM</h2>
      <p className="exercitium-subtitle">The flesh bears witness to every rep.</p>

      {/* Window toggle */}
      <div className="exercitium-row">
        <WindowButton
          value={7}
          label="Solar Week"
          current={windowDays}
          onClick={setWindowDays}
        />
        <WindowButton
          value={31}
          label="Solar Month"
          current={windowDays}
          onClick={setWindowDays}
        />
        <WindowButton
          value={365}
          label="Solar Year"
          current={windowDays}
          onClick={setWindowDays}
        />
      </div>

      {/* Featured quote — tied to the most-worked muscle in the window. */}
      {featuredQuote && (
        <blockquote className="exercitium-altar-quote">
          "{featuredQuote}"
        </blockquote>
      )}

      {/* Astartes body heatmap */}
      <AstartesBodyMap
        stats={sortedRows}
        displayUnit={displayUnit}
        landmarks={landmarks}
        groupWeeklySets={groupWeeklySets}
      />

      <table className="exercitium-sanctum-table">
        <thead>
          <tr>
            <ColHeader
              label="Muscle"
              col="muscle"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
            <ColHeader
              label="Sets"
              col="sets"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              align="right"
            />
            <ColHeader
              label={`Tonnage (${unitLabel(displayUnit)})`}
              col="tonnageKg"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              align="right"
            />
            <ColHeader
              label="Status"
              col="status"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r) => (
            <tr key={r.muscle}>
              <td>{formatMuscleName(r.muscle)}</td>
              <td className="exercitium-sanctum-num">{formatSets(r.sets)}</td>
              <td className="exercitium-sanctum-num">
                {formatTonnage(kgToDisplay(r.tonnageKg, displayUnit))}
              </td>
              <td>
                <StatusPill
                  status={r.status}
                  group={r.group}
                  weeklySets={r.groupWeeklySets}
                  landmarks={landmarks[r.group]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Click on a column header: if already sorting by this column, flip
  // direction; otherwise switch to that column with a sensible default
  // direction (asc for names, desc for numbers).
  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(col);
      // For numeric columns the interesting stuff is at the top, so we go
      // desc by default. For muscle names go alphabetical. For status go
      // ascending so the "worst" zones (rank 0 = under_mev) surface first.
      setSortDir(col === "muscle" || col === "status" ? "asc" : "desc");
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compareRows(
  a: SanctumRow,
  b: SanctumRow,
  key: SortKey,
  dir: SortDir,
): number {
  let cmp = 0;
  if (key === "muscle") {
    cmp = a.muscle < b.muscle ? -1 : a.muscle > b.muscle ? 1 : 0;
  } else if (key === "sets") {
    cmp = a.sets - b.sets;
  } else if (key === "tonnageKg") {
    cmp = a.tonnageKg - b.tonnageKg;
  } else {
    // Sort by "severity": under_mev first, then over_mrv, then mav_mrv,
    // then mev_mav. Ties resolved by descending weekly sets so within the
    // same zone the more-worked muscle floats up.
    cmp = STATUS_SORT_RANK[a.status] - STATUS_SORT_RANK[b.status];
    if (cmp === 0) cmp = b.groupWeeklySets - a.groupWeeklySets;
  }
  return dir === "asc" ? cmp : -cmp;
}

function formatMuscleName(m: Muscle): string {
  // "front_delts" → "Front Delts"
  return m
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatSets(n: number): string {
  // At most one decimal place; trim trailing zero.
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatTonnage(kg: number): string {
  // Round to nearest kg — decimals here add noise without precision.
  return Math.round(kg).toLocaleString();
}

// Same trick as on the Altar: hash the ISO date into a stable integer so
// today's quote stays the same all day but rolls over at midnight.
function dayIndex(date: string): number {
  let n = 0;
  for (let i = 0; i < date.length; i++) n = (n * 31 + date.charCodeAt(i)) | 0;
  return Math.abs(n);
}

// ---------------------------------------------------------------------------
// Sub-components
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

// Small colored pill summarizing a muscle group's volume status. The
// tooltip (native `title` attr) shows the exact weekly sets and the
// landmark triple so the user can see why the color came out the way it
// did — hover on desktop, long-press on Android.
function StatusPill({
  status,
  group,
  weeklySets,
  landmarks,
}: {
  status: VolumeStatus;
  group: MuscleGroup;
  weeklySets: number;
  landmarks: Landmarks;
}) {
  const tooltip =
    `${formatGroupName(group)} — ${formatSets(weeklySets)} sets/wk\n` +
    `MEV ${landmarks.mev} · MAV ${landmarks.mav} · MRV ${landmarks.mrv}\n` +
    STATUS_EXPLAIN[status];
  return (
    <span
      className={`exercitium-sanctum-status exercitium-sanctum-status-${status}`}
      title={tooltip}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const STATUS_LABEL: Record<VolumeStatus, string> = {
  under_mev: "Under MEV",
  mev_mav: "Productive",
  mav_mrv: "High",
  over_mrv: "Over MRV",
};

const STATUS_EXPLAIN: Record<VolumeStatus, string> = {
  under_mev: "Not enough stimulus for growth. Add a set or two.",
  mev_mav: "In the productive range.",
  mav_mrv: "Growing but fatigue accumulates — mind recovery.",
  over_mrv: "Beyond what you can recover from. Pull volume back.",
};

function formatGroupName(g: MuscleGroup): string {
  return g
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function ColHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (col: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = col === sortKey;
  const arrow = active ? (sortDir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        cursor: "pointer",
        textAlign: align ?? "left",
        userSelect: "none",
      }}
    >
      {label}
      {arrow}
    </th>
  );
}
