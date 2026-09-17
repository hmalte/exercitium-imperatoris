// Encumbrance Lifted Off the Soul — weekly volume, stacked bar chart.
//
// One bar per week (Monday-start). The bar is segmented by muscle group —
// chest, back, legs, etc. — so you see both total weekly sets and the
// distribution across the body at a glance.
//
// Unit: effective sets (primary 1.0, secondary 0.5). Tonnage would make
// the stack massively dominated by compound lifts and lose the per-group
// resolution we're trying to show.

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { PanelCommon } from "../CodexApp";
import { weeklyVolumeByGroup } from "../../domain/stats";
import {
  MUSCLE_GROUPS,
  type MuscleGroup,
} from "../../domain/landmarks";
import { EmptyPanel, CHART_HEIGHT, GRIMDARK, GROUP_COLORS } from "./chartUtils";

type Row = {
  weekStart: string;
} & Record<MuscleGroup, number>;

export function EncumbranceLifted({ sessions, exercises }: PanelCommon) {
  const data = useMemo<Row[]>(() => {
    return weeklyVolumeByGroup(sessions, exercises).map((row) => {
      // Flatten the nested `groups` object into top-level keys because
      // Recharts' <Bar dataKey> reads from the row root.
      const flat: Row = { weekStart: row.weekStart } as Row;
      for (const g of MUSCLE_GROUPS) {
        flat[g] = round1(row.groups[g]);
      }
      return flat;
    });
  }, [sessions, exercises]);

  if (data.length === 0) {
    return (
      <EmptyPanel>
        No sessions logged in this window. The soul carries no burden.
      </EmptyPanel>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid stroke={GRIMDARK.gridStroke} strokeDasharray="3 3" />
        <XAxis
          dataKey="weekStart"
          tick={{ fill: GRIMDARK.axisText, fontSize: 11 }}
          stroke={GRIMDARK.axisLine}
        />
        <YAxis
          tick={{ fill: GRIMDARK.axisText, fontSize: 11 }}
          stroke={GRIMDARK.axisLine}
          label={{
            value: "sets",
            angle: -90,
            position: "insideLeft",
            style: { fill: GRIMDARK.axisText, fontSize: 11 },
          }}
        />
        <Tooltip
          contentStyle={GRIMDARK.tooltipStyle}
          labelStyle={{ color: GRIMDARK.gold }}
          formatter={(v, name) => [`${v} sets`, formatGroupName(String(name))]}
          labelFormatter={(d) => `Week of ${d}`}
        />
        <Legend
          wrapperStyle={{ color: GRIMDARK.axisText, fontSize: 11 }}
          formatter={(val: string) => formatGroupName(val)}
        />
        {/* One <Bar/> per group, all with the same stackId so they sit
            on top of each other. Zero-value groups contribute a 0-height
            segment — harmless. */}
        {MUSCLE_GROUPS.map((g) => (
          <Bar
            key={g}
            dataKey={g}
            stackId="volume"
            fill={GROUP_COLORS[g]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatGroupName(g: string): string {
  return g
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
