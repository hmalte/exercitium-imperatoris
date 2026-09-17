// Days of Glory — day-by-day streak ribbon.
//
// One colored square per day, ending at today. Colors:
//   • blood-red   — normal training session logged
//   • gold        — Cardio Week session (deload; still counts)
//   • parchment   — Leave of Absence (pilgrimage; paused, not broken)
//   • dark        — rest day
//
// Rows wrap at 30 days so longer windows read like a calendar without
// needing a horizontal scroll on mobile. Hover/long-press reveals the date.
//
// This panel is mostly CSS; the data shape comes from stats.streakRibbon.

import { useMemo } from "react";
import type { PanelCommon } from "../CodexApp";
import {
  streakRibbon,
  type DayState,
  type RibbonDay,
} from "../../domain/stats";
import { EmptyPanel } from "./chartUtils";

// Cap the ribbon length for the "all time" window. A year of squares is
// already a lot; showing five would drown the panel.
const MAX_RIBBON_DAYS = 365;

// Wrap at 30 to mimic "months". Exact calendar months would complicate
// rendering without meaningful payoff — the user reads "chunks of time"
// from this, not specific dates.
const DAYS_PER_ROW = 30;

// Short copy shown under the ribbon, per state. Used in the legend so the
// colors aren't decoded by reverse-engineering.
const STATE_LABEL: Record<DayState, string> = {
  trained: "Trained",
  cardio: "Cardio Week",
  loa: "Pilgrimage",
  rest: "Rest",
};

export function DaysOfGlory({ sessions, loas, today, window }: PanelCommon) {
  const days = useMemo(() => {
    const requested =
      window === "all" ? MAX_RIBBON_DAYS : Math.min(window, MAX_RIBBON_DAYS);
    return streakRibbon(sessions, loas, today, requested);
  }, [sessions, loas, today, window]);

  // Split into chunks of DAYS_PER_ROW for row-by-row rendering. Building an
  // array of arrays in the render path would work but the useMemo keeps
  // re-renders cheap when only tooltips are mousing over.
  const rows = useMemo(() => chunk(days, DAYS_PER_ROW), [days]);

  const tally = useMemo(() => {
    const t: Record<DayState, number> = {
      trained: 0,
      cardio: 0,
      loa: 0,
      rest: 0,
    };
    for (const d of days) t[d.state]++;
    return t;
  }, [days]);

  if (days.length === 0) {
    return <EmptyPanel>No days recorded yet. Begin the ritual.</EmptyPanel>;
  }

  return (
    <div className="exercitium-codex-ribbon">
      {rows.map((row, i) => (
        <div className="exercitium-codex-ribbon-row" key={i}>
          {row.map((d) => (
            <DayCell key={d.date} day={d} />
          ))}
        </div>
      ))}

      {/* Legend + tally. Shows counts per state so the user has a quick
          read on the window ("47 trained, 12 rest, 3 pilgrimage, 0 cardio"). */}
      <div className="exercitium-codex-ribbon-legend">
        {(["trained", "cardio", "loa", "rest"] as DayState[]).map((st) => (
          <span className="exercitium-codex-ribbon-legend-item" key={st}>
            <span
              className={`exercitium-codex-ribbon-cell exercitium-codex-ribbon-cell-${st}`}
              aria-hidden
            />
            {STATE_LABEL[st]} · {tally[st]}
          </span>
        ))}
      </div>
    </div>
  );
}

function DayCell({ day }: { day: RibbonDay }) {
  return (
    <span
      className={`exercitium-codex-ribbon-cell exercitium-codex-ribbon-cell-${day.state}`}
      title={`${day.date} — ${STATE_LABEL[day.state]}`}
    />
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
