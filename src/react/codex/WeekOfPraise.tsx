// Week of Praise — Cardio Week (deload) chronicle.
//
// Each Cardio Week the user has taken is shown as its own entry: the date
// range, how many cardio sessions fell inside it, and how many minutes of
// cardio were logged. This is the deload half of the ritual — the user
// sees their discipline in giving the body rest, not just in the grind.
//
// Data source:
//   deriveCardioWeekRanges(sessions) — groups cardio-flagged sessions into
//   7-day LoA-shaped spans. Sessions outside the window are already filtered
//   out upstream, so the ranges surfaced here reflect only what happened in
//   the selected window.

import { useMemo } from "react";
import type { PanelCommon } from "../CodexApp";
import { deriveCardioWeekRanges, type LoA } from "../../domain/timeLogic";
import type { SessionFile } from "../../domain/schemas";
import { EmptyPanel } from "./chartUtils";

type WeekEntry = {
  range: LoA;
  sessions: number;
  cardioMinutes: number;
};

export function WeekOfPraise({ sessions }: PanelCommon) {
  const entries = useMemo<WeekEntry[]>(() => {
    // deriveCardioWeekRanges takes the slim Session shape — map from
    // SessionFile down to what it expects.
    const ranges = deriveCardioWeekRanges(
      sessions.map((s) => ({
        date: s.date,
        isCardioWeek: s.isCardioWeek,
        rotationPosition: s.rotationPosition,
      })),
    );
    // Most recent first — users are more interested in their latest deload
    // than their first one years back.
    return ranges
      .map((range) => summarizeWeek(range, sessions))
      .sort((a, b) => (a.range.start < b.range.start ? 1 : -1));
  }, [sessions]);

  if (entries.length === 0) {
    return (
      <EmptyPanel>
        No Cardio Weeks in this window. The anvil has not yet rested.
      </EmptyPanel>
    );
  }

  return (
    <ul className="exercitium-codex-praise-list">
      {entries.map((e) => (
        <li className="exercitium-codex-praise-item" key={e.range.start}>
          <div className="exercitium-codex-praise-dates">
            {formatRange(e.range)}
          </div>
          <div className="exercitium-codex-praise-stats">
            {e.sessions} session{e.sessions === 1 ? "" : "s"}
            {" · "}
            {e.cardioMinutes} min cardio
          </div>
        </li>
      ))}
    </ul>
  );
}

// Tally how many cardio sessions fell inside this week range and total up
// their cardioMinutes. Sessions missing a cardioMinutes value count as 0.
function summarizeWeek(range: LoA, sessions: SessionFile[]): WeekEntry {
  let count = 0;
  let mins = 0;
  for (const s of sessions) {
    if (!s.isCardioWeek) continue;
    if (s.date < range.start || s.date > range.end) continue;
    count++;
    mins += s.cardioMinutes ?? 0;
  }
  return { range, sessions: count, cardioMinutes: mins };
}

function formatRange(r: LoA): string {
  return r.start === r.end ? r.start : `${r.start} → ${r.end}`;
}
