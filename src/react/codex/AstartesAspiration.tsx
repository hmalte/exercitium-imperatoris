// Astartes Aspiration — estimated 1RM progression per lift.
//
// Line chart, one line per lift. The series are pre-sorted by data-point
// count (most-trained first), and the user toggles which lifts to display
// via a checkbox strip under the chart. Defaults to the top three so the
// first view is readable rather than a 20-line spaghetti plot.
//
// Data source: stats.oneRepMaxSeriesByLift — takes the best Epley across
// each session's sets.

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { PanelCommon } from "../CodexApp";
import { oneRepMaxSeriesByLift, type LiftSeries } from "../../domain/stats";
import { kgToDisplay, unitLabel } from "../../domain/units";
import { EmptyPanel, CHART_HEIGHT, GRIMDARK } from "./chartUtils";

const MAX_DEFAULT_LINES = 3;

// Distinct-but-theme-consistent line palette. Ordering matters — the top-N
// lifts take the first N colors, which is why blood comes first: the user's
// heaviest lift is the most "them".
const LINE_COLORS = [
  "#a63232", // blood
  "#caa03d", // gold
  "#c9c0a0", // bone
  "#7a2a4a", // dark rose
  "#2a4a3a", // dark moss
  "#6a5a1a", // olive
  "#8a3a20", // rust
  "#3a2a6a", // indigo
];

export function AstartesAspiration({
  sessions,
  exercises,
  displayUnit,
}: PanelCommon) {
  const allSeries = useMemo(
    () => oneRepMaxSeriesByLift(sessions, exercises),
    [sessions, exercises],
  );

  // Which lift IDs are currently toggled on. Start with the first N most-
  // trained lifts — gives the user a useful view on first open.
  const [enabledIds, setEnabledIds] = useState<Set<string>>(() => {
    return new Set(allSeries.slice(0, MAX_DEFAULT_LINES).map((s) => s.exerciseId));
  });

  const enabledSeries = allSeries.filter((s) => enabledIds.has(s.exerciseId));

  // Recharts' multi-series line chart expects one row per x-tick with one
  // column per series. Merge every date across every enabled series into a
  // single sorted axis, then fill in values per lift.
  const data = useMemo(() => {
    if (enabledSeries.length === 0) return [];
    const allDates = new Set<string>();
    for (const s of enabledSeries) for (const p of s.points) allDates.add(p.date);
    const sortedDates = Array.from(allDates).sort();

    return sortedDates.map((date) => {
      const row: Record<string, number | string> = { date };
      for (const s of enabledSeries) {
        const point = s.points.find((p) => p.date === date);
        // Epley 1RM values are stored in kg; convert at the display boundary
        // so axis + tooltip both read in the user's chosen unit.
        if (point) {
          row[s.exerciseId] = Math.round(kgToDisplay(point.value, displayUnit));
        }
      }
      return row;
    });
  }, [enabledSeries, displayUnit]);

  if (allSeries.length === 0) {
    return (
      <EmptyPanel>
        No weighted lifts logged. Aspiration awaits a barbell.
      </EmptyPanel>
    );
  }

  function toggle(id: string) {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={GRIMDARK.gridStroke} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fill: GRIMDARK.axisText, fontSize: 11 }}
            stroke={GRIMDARK.axisLine}
          />
          <YAxis
            unit={unitLabel(displayUnit)}
            tick={{ fill: GRIMDARK.axisText, fontSize: 11 }}
            stroke={GRIMDARK.axisLine}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={GRIMDARK.tooltipStyle}
            labelStyle={{ color: GRIMDARK.gold }}
            formatter={(v, name) => {
              const id = String(name);
              const series = allSeries.find((s) => s.exerciseId === id);
              return [`${v} ${unitLabel(displayUnit)}`, series?.displayName ?? id];
            }}
          />
          <Legend
            wrapperStyle={{ color: GRIMDARK.axisText, fontSize: 11 }}
            formatter={(id: string) => {
              const s = allSeries.find((x) => x.exerciseId === id);
              return s?.displayName ?? id;
            }}
          />
          {enabledSeries.map((s, i) => (
            <Line
              key={s.exerciseId}
              type="monotone"
              dataKey={s.exerciseId}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Lift picker. Three or four exercises onscreen at once is readable;
          more and it turns to noise. We let the user opt into any. */}
      <div className="exercitium-codex-lift-picker">
        <span className="exercitium-codex-lift-picker-label">Lifts shown:</span>
        {allSeries.map((s) => renderChip(s, enabledIds.has(s.exerciseId), toggle))}
      </div>
    </div>
  );
}

function renderChip(
  s: LiftSeries,
  enabled: boolean,
  onToggle: (id: string) => void,
) {
  return (
    <button
      key={s.exerciseId}
      type="button"
      className={
        "exercitium-codex-lift-chip" +
        (enabled ? " exercitium-codex-lift-chip-on" : "")
      }
      onClick={() => onToggle(s.exerciseId)}
      title={`${s.points.length} session${s.points.length === 1 ? "" : "s"}`}
    >
      {s.displayName}
    </button>
  );
}
