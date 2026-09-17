// Astartes body heatmap — now backed by `react-body-highlighter`.
//
// The library renders anatomically-correct anterior/posterior SVG figures
// with labeled muscle regions; we feed it data (one entry per library
// muscle with a 1-12 integer frequency) and a 12-step color gradient. It
// handles the geometry; we handle the grimdark dressing around it.
//
// Things to know:
//   • Our schema has ~16 muscles; the library has its own ~18. They don't
//     line up exactly — see MUSCLE_MAP below for every delta. The mapping
//     lives in ONE place so anyone who needs to tweak it has a single
//     file to edit.
//   • Color scale: blood red (1 set) → candle gold (12+ sets), saturating
//     at 12 so a single heavy week of chest doesn't wash out everything
//     else. `bodyColor` (the "untrained" background tone on the figures)
//     is an even darker red so the baseline reads "cold flesh" rather
//     than "library default gray".
//   • Click drawer: tapping a highlighted muscle opens a panel listing
//     every ONE of our muscles that maps to that region, with its sets
//     and tonnage. Closes on re-tap or ✕.
//   • Gothic frame: a separate React subtree wraps the library output.
//     Skulls in the four corners, a stylized Aquila at the top, and a
//     gold double-border as a stand-in chain. Purely decorative; clicks
//     fall through to the body models thanks to pointer-events: none.

import { useMemo, useState } from "react";
import Model, {
  type IExerciseData,
  type IMuscleStats,
  type Muscle as LibMuscle,
} from "react-body-highlighter";
import type { Muscle } from "../domain/schemas";
import type { MuscleStats } from "../domain/volume";
import {
  type Landmarks,
  type MuscleGroup,
  MUSCLE_TO_GROUP,
} from "../domain/landmarks";
import { AquilaSVG, CandleSkullSVG } from "./GothicSvgs";
import { type DisplayUnit, kgToDisplay, unitLabel } from "../domain/units";

// ---------------------------------------------------------------------------
// Our muscle → library muscle(s)
// ---------------------------------------------------------------------------
//
// Some of ours fan out to several library muscles; a few of ours collapse
// into one library muscle because the library doesn't render that region
// separately. Notes on the oddballs:
//   • back → trapezius + upper-back. Our `back` covers the whole upper-mid
//     back block; the library paints it as two distinct regions.
//   • lats → upper-back. The library has no lats muscle. If you care about
//     separating lats from mid-back visually, this is where you'd start.
//   • side_delts → front-deltoids. The library has no lateral deltoid.
//     Lateral raises end up coloring the anterior delt region.
//   • lower_back renders on the posterior view only.
export const MUSCLE_MAP: Record<Muscle, LibMuscle[]> = {
  chest: ["chest"],
  back: ["trapezius", "upper-back"],
  lats: ["upper-back"],
  lower_back: ["lower-back"],
  quads: ["quadriceps"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal"],
  calves: ["calves"],
  front_delts: ["front-deltoids"],
  side_delts: ["front-deltoids"],
  rear_delts: ["back-deltoids"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearm"],
  abs: ["abs"],
  obliques: ["obliques"],
};

// ---------------------------------------------------------------------------
// Color scale — landmark-aware bands
// ---------------------------------------------------------------------------
//
// The library takes one `highlightedColors` palette and indexes it by an
// integer `frequency` (1..N). We bake four RP volume BANDS into a 12-step
// palette:
//
//   freq  1..3  → under_mev   cold grey stone (neglected)
//   freq  4..6  → mev_mav     warm ember orange (productive range)
//   freq  7..9  → mav_mrv     glowing gold (grinding, top of productive)
//   freq 10..12 → over_mrv    blood-red shimmer (overreaching)
//
// Per lib-muscle we classify the dominant source group's weekly sets against
// its landmarks, then map inside-the-band to freq 1/2/3 by how far through
// the band we are. The library picks that color and paints the region.

// Baseline color for muscles not in `data` (i.e. untrained in the window).
// A near-black blood red so the figure reads "cold flesh" rather than
// "unrendered". The library darkens on hover automatically, which looks
// fine here.
const BODY_COLOR = "#3a0a0a";

// 12-step palette — three shades per band. Tuned to read against the
// parchment frame: greys stay dark enough to look "stone", ambers carry
// enough saturation to pop, reds push toward a bruise tone rather than
// pure crimson so they don't clash with the Aquila's gold.
const HIGHLIGHT_COLORS: string[] = [
  // 1..3 — under MEV, cold grey stone
  "#2a2a2a",
  "#3a3a36",
  "#4a4a42",
  // 4..6 — MEV..MAV, warm ember
  "#6e3a10",
  "#8a4a14",
  "#b86418",
  // 7..9 — MAV..MRV, glowing gold
  "#d48a1a",
  "#e0a420",
  "#eab82a",
  // 10..12 — over MRV, blood-red shimmer
  "#8a1826",
  "#b02030",
  "#d42040",
];

// Given a group's weekly sets and its landmark triple, pick an integer
// frequency in 1..12 that encodes the band AND the position inside the
// band. Clamped so downstream code never sees 0 or a frequency outside
// the palette. Exported (via tests-only path if needed) but not shared
// publicly — kept here as a private helper to this file.
function bandFrequency(weeklySets: number, l: Landmarks): number {
  // Position-in-band maps to 0..2 integer offset; clamp before adding to
  // the band base so floating-point nudges can't push past the top shade.
  const sub = (t: number) => Math.max(0, Math.min(2, Math.round(t * 2)));
  if (weeklySets < l.mev) {
    const t = l.mev <= 0 ? 1 : weeklySets / l.mev;
    return 1 + sub(t);
  }
  if (weeklySets < l.mav) {
    const span = Math.max(1e-9, l.mav - l.mev);
    return 4 + sub((weeklySets - l.mev) / span);
  }
  if (weeklySets <= l.mrv) {
    const span = Math.max(1e-9, l.mrv - l.mav);
    return 7 + sub((weeklySets - l.mav) / span);
  }
  // Above MRV — scale how far over (25% over MRV saturates the shimmer).
  const over = weeklySets - l.mrv;
  const ceiling = Math.max(1, l.mrv * 0.25);
  return 10 + sub(over / ceiling);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export type AstartesBodyMapProps = {
  stats: MuscleStats[];
  displayUnit: DisplayUnit;
  /** MEV/MAV/MRV per muscle group — drives the band palette. */
  landmarks: Record<MuscleGroup, Landmarks>;
  /** Weekly-averaged sets per muscle group, already scaled to the chosen
   *  window (so a 4-week window still compares against per-week landmarks). */
  groupWeeklySets: Record<MuscleGroup, number>;
};

export function AstartesBodyMap({
  stats,
  displayUnit,
  landmarks,
  groupWeeklySets,
}: AstartesBodyMapProps) {
  // The muscle currently selected via click. `null` means the drawer is
  // closed. Re-tapping the same muscle toggles it off.
  const [selectedLib, setSelectedLib] = useState<LibMuscle | null>(null);

  // Per-muscle lookup used by the drawer. The library gives us back a
  // library-muscle name on click; we reverse-map to show every one of OUR
  // muscles that flows into that region.
  const byMuscle = useMemo(() => {
    const m = new Map<Muscle, MuscleStats>();
    for (const s of stats) m.set(s.muscle, s);
    return m;
  }, [stats]);

  // Build per-lib-muscle data. For each lib region:
  //   1. Sum raw sets from every schema muscle that maps to it (so zero-set
  //      muscles don't appear in the render set).
  //   2. Identify every source GROUP feeding that region, and pick the
  //      dominant one (highest weekly sets) as the landmark authority.
  //   3. Classify the dominant group's weekly sets against its landmarks,
  //      producing a band frequency 1..12 that the HIGHLIGHT_COLORS palette
  //      maps to a colored shade. This is what gives the heatmap its "RP
  //      volume zone" reading instead of a linear set-count ramp.
  const data = useMemo<IExerciseData[]>(() => {
    const libSets = new Map<LibMuscle, number>();
    const libGroups = new Map<LibMuscle, Set<MuscleGroup>>();
    for (const s of stats) {
      if (s.sets <= 0) continue;
      const group = MUSCLE_TO_GROUP[s.muscle];
      for (const libName of MUSCLE_MAP[s.muscle] ?? []) {
        libSets.set(libName, (libSets.get(libName) ?? 0) + s.sets);
        let groups = libGroups.get(libName);
        if (!groups) {
          groups = new Set<MuscleGroup>();
          libGroups.set(libName, groups);
        }
        groups.add(group);
      }
    }
    const out: IExerciseData[] = [];
    for (const [libName] of libSets) {
      const groups = libGroups.get(libName) ?? new Set<MuscleGroup>();
      // Pick the group with the most weekly sets — that's the "authority"
      // whose landmarks decide the color band for this lib muscle.
      let dominantGroup: MuscleGroup | null = null;
      let best = -1;
      for (const g of groups) {
        const ws = groupWeeklySets[g] ?? 0;
        if (ws > best) {
          best = ws;
          dominantGroup = g;
        }
      }
      if (!dominantGroup) continue;
      const freq = bandFrequency(
        groupWeeklySets[dominantGroup] ?? 0,
        landmarks[dominantGroup],
      );
      out.push({
        // `name` shows up inside the library's onClick payload. We don't
        // use it for display — the drawer reads from our own byMuscle map.
        name: libName,
        muscles: [libName],
        frequency: freq,
      });
    }
    return out;
  }, [stats, landmarks, groupWeeklySets]);

  const handleClick = (info: IMuscleStats) => {
    // Toggle: clicking the currently-open muscle closes the drawer.
    setSelectedLib((prev) => (prev === info.muscle ? null : info.muscle));
  };

  return (
    <div className="exercitium-bodymap-root">
      <GothicFrame>
        <div className="exercitium-bodymap-models">
          <Model
            type="anterior"
            data={data}
            bodyColor={BODY_COLOR}
            highlightedColors={HIGHLIGHT_COLORS}
            onClick={handleClick}
            style={MODEL_STYLE}
            svgStyle={SVG_STYLE}
          />
          <Model
            type="posterior"
            data={data}
            bodyColor={BODY_COLOR}
            highlightedColors={HIGHLIGHT_COLORS}
            onClick={handleClick}
            style={MODEL_STYLE}
            svgStyle={SVG_STYLE}
          />
        </div>
      </GothicFrame>
      {selectedLib && (
        <MuscleDrawer
          libMuscle={selectedLib}
          byMuscle={byMuscle}
          displayUnit={displayUnit}
          onClose={() => setSelectedLib(null)}
        />
      )}
    </div>
  );
}

// The library accepts style objects — these are just sized wrappers so
// both figures sit the same width and share a dark background with the
// gothic frame. We deliberately leave colors to CSS; only layout here.
const MODEL_STYLE: React.CSSProperties = {
  width: "140px",
  padding: "0.25rem",
};
const SVG_STYLE: React.CSSProperties = {
  cursor: "pointer",
};

// ---------------------------------------------------------------------------
// Gothic frame
// ---------------------------------------------------------------------------

function GothicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="exercitium-bodymap-frame">
      <div className="exercitium-bodymap-aquila">
        <AquilaSVG size={130} />
      </div>
      <div className="exercitium-bodymap-skull exercitium-bodymap-skull-tl">
        <CandleSkullSVG size={34} />
      </div>
      <div className="exercitium-bodymap-skull exercitium-bodymap-skull-tr">
        <CandleSkullSVG size={34} />
      </div>
      <div className="exercitium-bodymap-skull exercitium-bodymap-skull-bl">
        <CandleSkullSVG size={34} />
      </div>
      <div className="exercitium-bodymap-skull exercitium-bodymap-skull-br">
        <CandleSkullSVG size={34} />
      </div>
      <div className="exercitium-bodymap-frame-inner">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Muscle drawer (opens on click of a highlighted region)
// ---------------------------------------------------------------------------

function MuscleDrawer({
  libMuscle,
  byMuscle,
  displayUnit,
  onClose,
}: {
  libMuscle: LibMuscle;
  byMuscle: Map<Muscle, MuscleStats>;
  displayUnit: DisplayUnit;
  onClose: () => void;
}) {
  // Reverse the muscle map: find every ONE of our muscles that maps to
  // this library region. If multiple (e.g. back + lats both → upper-back),
  // list them all so the user knows what's really driving the color.
  const ourMuscles = (Object.entries(MUSCLE_MAP) as [Muscle, LibMuscle[]][])
    .filter(([, libs]) => libs.includes(libMuscle))
    .map(([k]) => k);

  return (
    <div className="exercitium-bodymap-drawer">
      <div className="exercitium-bodymap-drawer-header">
        <h3>{formatLibMuscle(libMuscle)}</h3>
        <button
          className="exercitium-btn exercitium-btn-secondary"
          onClick={onClose}
          aria-label="Close"
          style={{ padding: "0 0.6rem" }}
        >
          ×
        </button>
      </div>
      <ul className="exercitium-bodymap-drawer-list">
        {ourMuscles.map((m) => {
          const s = byMuscle.get(m);
          return (
            <li key={m}>
              <span>{formatMuscleName(m)}</span>
              <span className="exercitium-bodymap-drawer-stats">
                {formatSets(s?.sets ?? 0)} sets ·{" "}
                {formatTonnage(kgToDisplay(s?.tonnageKg ?? 0, displayUnit))}{" "}
                {unitLabel(displayUnit)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatMuscleName(m: Muscle): string {
  return m
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatLibMuscle(m: LibMuscle): string {
  // "front-deltoids" → "Front Deltoids"
  return m
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatSets(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatTonnage(kg: number): string {
  return Math.round(kg).toLocaleString();
}
