// Shared bits used by every Codex chart panel.
//
// Keeping the palette and the empty-state component in one spot means all
// six charts read the same, and a future theme pass (Phase 7) can retune
// the colors without editing every panel.

import type { CSSProperties, ReactNode } from "react";

// Fixed height keeps the grid layout stable across tab switches. Recharts'
// ResponsiveContainer handles width; height stays pinned so panels don't
// reflow when data changes.
export const CHART_HEIGHT = 240;

// Grimdark palette. Deliberate choices:
//   • blood — deep saturated red for user-logged data (their own flesh).
//   • gold  — burnished amber for averages/landmarks (Imperial benchmark).
//   • bone  — cold off-white for neutral/rest states.
//   • rust  — over-volume / warning red, still dark enough to read.
export const GRIMDARK = {
  blood: "#a63232",
  gold: "#caa03d",
  bone: "#c9c0a0",
  rust: "#6a1f28",
  parchment: "#3a2a10",

  axisText: "#8a7a3a",
  axisLine: "#4a3a10",
  gridStroke: "#2a1a0a",

  tooltipStyle: {
    background: "#120707",
    border: "1px solid #8a6f2a",
    color: "#c9b57a",
  } as CSSProperties,
} as const;

// Stacked bar palette for the 14 muscle groups. Recharts picks up the
// `fill` prop on each <Bar/>, so order matters for visual grouping.
// Ordering: push chain → pull chain → core → legs, with deltoid variants
// clustered so the stack reads as one "shoulder" block.
export const GROUP_COLORS: Record<string, string> = {
  chest:       "#a63232",
  front_delts: "#c44d3a",
  side_delts:  "#d46a3a",
  rear_delts:  "#8a3a20",
  triceps:     "#e39a3a",
  back:        "#5a3a10",
  biceps:      "#caa03d",
  forearms:    "#9a7a2a",
  core:        "#7a6a1a",
  lower_back:  "#4a3a10",
  glutes:      "#6a2a3a",
  quads:       "#8a2a4a",
  hamstrings:  "#3a2a6a",
  calves:      "#2a4a3a",
};

// Default render for "nothing to show in this window". Intentionally
// flavored but not showy — users staring at an empty panel on first install
// should feel invited, not mocked.
export function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className="exercitium-codex-empty">{children}</div>;
}
