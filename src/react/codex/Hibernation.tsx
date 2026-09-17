// Hibernation — sleep hours line chart.
//
// Same two-line layout as Burden of the Flesh (raw + 7-day average), plus
// a horizontal reference line at 7 hours — the brief's "the Emperor demands
// seven" threshold. Anything below that line is undersleeping.

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { PanelCommon } from "../CodexApp";
import { sleepTimeline, rollingAverage } from "../../domain/stats";
import { addDays } from "../../domain/timeLogic";
import { EmptyPanel, CHART_HEIGHT, GRIMDARK } from "./chartUtils";

type Row = {
  date: string;
  sleep: number;
  avg: number;
};

const SLEEP_TARGET_HOURS = 7;

export function Hibernation({ sessions, window, today }: PanelCommon) {
  const data = useMemo<Row[]>(() => {
    const raw = sleepTimeline(sessions);
    const avg = rollingAverage(raw, 7);
    return raw.map((p, i) => ({
      date: p.date,
      sleep: round1(p.value),
      avg: round1(avg[i]?.value ?? p.value),
    }));
  }, [sessions]);

  if (data.length === 0) {
    return (
      <EmptyPanel>
        No slumber recorded in this window. The Emperor waits.
      </EmptyPanel>
    );
  }

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
          unit="h"
          domain={[0, 12]}
          tick={{ fill: GRIMDARK.axisText, fontSize: 11 }}
          stroke={GRIMDARK.axisLine}
        />
        <Tooltip
          contentStyle={GRIMDARK.tooltipStyle}
          labelStyle={{ color: GRIMDARK.gold }}
          formatter={(v) => `${v} h`}
        />
        <Legend wrapperStyle={{ color: GRIMDARK.axisText, fontSize: 12 }} />
        {/* The Emperor's mandate: seven hours. */}
        <ReferenceLine
          y={SLEEP_TARGET_HOURS}
          stroke={GRIMDARK.gold}
          strokeDasharray="6 4"
          label={{
            value: "Imperial mandate · 7h",
            fill: GRIMDARK.gold,
            fontSize: 10,
            position: "insideTopRight",
          }}
        />
        <Line
          type="monotone"
          dataKey="sleep"
          name="Sleep"
          stroke={GRIMDARK.blood}
          strokeWidth={1.5}
          dot={{ r: 2, fill: GRIMDARK.blood }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="avg"
          name="7-day average"
          stroke={GRIMDARK.bone}
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
