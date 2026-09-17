// Burden of the Flesh — bodyweight line chart.
//
// Two lines on one axis:
//   • raw bodyweight (the user's logged values)
//   • 7-day rolling average (smoothed trend)
//
// We deliberately compute the rolling average over the FULL history (not
// just the filtered window) so the first few points of a short window
// already have a stable baseline. The same trick applies to Hibernation.

import { useMemo } from "react";
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
import { bodyweightTimeline, rollingAverage } from "../../domain/stats";
import { addDays } from "../../domain/timeLogic";
import { kgToDisplay, unitLabel } from "../../domain/units";
import { EmptyPanel, CHART_HEIGHT, GRIMDARK } from "./chartUtils";

type Row = {
  date: string;
  bodyweight: number;
  avg: number;
};

export function BurdenOfTheFlesh({
  sessions,
  window,
  today,
  displayUnit,
}: PanelCommon) {
  const data = useMemo<Row[]>(() => {
    // We need the full timeline for a stable rolling average — but the
    // panel-level filter already trimmed sessions to the window. That's
    // fine for a first-pass UX: early points inside a short window simply
    // average with what's available. If it ever feels jittery we'd need
    // to pass the full-history sessions alongside the filtered slice.
    //
    // Values are converted from kg (storage unit) to the display unit at
    // this boundary so every downstream consumer — the chart, the axis,
    // the tooltip — sees already-converted numbers and doesn't need to
    // remember the rule.
    const raw = bodyweightTimeline(sessions);
    const avg = rollingAverage(raw, 7);
    return raw.map((p, i) => ({
      date: p.date,
      bodyweight: round1(kgToDisplay(p.value, displayUnit)),
      avg: round1(kgToDisplay(avg[i]?.value ?? p.value, displayUnit)),
    }));
  }, [sessions, displayUnit]);

  if (data.length === 0) {
    return (
      <EmptyPanel>
        No bodyweight logged in this window. The flesh is unmeasured.
      </EmptyPanel>
    );
  }

  // X-axis domain: derive from data, but if `window` is numeric pin the left
  // edge to (today - window) so a sparse series doesn't zoom in and hide
  // the time scale the user selected.
  const xMin = typeof window === "number"
    ? addDays(today, -(window - 1))
    : data[0].date;
  const xMax = today;

  return (
    <>
      <div className="exercitium-codex-datacount">
        7-day average · {data.length} {data.length === 1 ? "log" : "logs"} in window
      </div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid stroke={GRIMDARK.gridStroke} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          type="category"
          domain={[xMin, xMax]}
          allowDuplicatedCategory={false}
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
          formatter={(v) => `${v} ${unitLabel(displayUnit)}`}
        />
        <Legend wrapperStyle={{ color: GRIMDARK.axisText, fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="bodyweight"
          name="Bodyweight"
          stroke={GRIMDARK.blood}
          strokeWidth={1.5}
          dot={{ r: 2, fill: GRIMDARK.blood }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="avg"
          name="7-day average"
          stroke={GRIMDARK.gold}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
