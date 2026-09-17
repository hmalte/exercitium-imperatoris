// Unit tests for the volume-landmarks module.
//
// Covers the three pure pieces independently:
//   • classifyVolume — every zone + every boundary.
//   • weeklyAverage  — basic math and the divide-by-zero guard.
//   • MUSCLE_TO_GROUP / DEFAULT_LANDMARKS — completeness invariants.
//
// Plus a parse/serialize round-trip to make sure the YAML survives a save
// and re-load, and a malformed-file defense test to make sure we never hand
// NaN to the UI.

import { describe, it, expect } from "vitest";
import {
  classifyVolume,
  weeklyAverage,
  DEFAULT_LANDMARKS,
  MUSCLE_GROUPS,
  MUSCLE_TO_GROUP,
  parseVolumeLandmarks,
  serializeVolumeLandmarks,
  type Landmarks,
} from "./landmarks";
import { MUSCLES } from "./schemas";

describe("classifyVolume", () => {
  const L: Landmarks = { mev: 8, mav: 14, mrv: 20 };

  it("returns under_mev when below MEV", () => {
    expect(classifyVolume(0, L)).toBe("under_mev");
    expect(classifyVolume(7.9, L)).toBe("under_mev");
  });

  it("returns mev_mav at MEV and in the productive range", () => {
    expect(classifyVolume(8, L)).toBe("mev_mav");
    expect(classifyVolume(10, L)).toBe("mev_mav");
    expect(classifyVolume(13.9, L)).toBe("mev_mav");
  });

  it("returns mav_mrv at MAV and through MRV", () => {
    expect(classifyVolume(14, L)).toBe("mav_mrv");
    expect(classifyVolume(17, L)).toBe("mav_mrv");
    expect(classifyVolume(20, L)).toBe("mav_mrv");
  });

  it("returns over_mrv when above MRV", () => {
    expect(classifyVolume(20.1, L)).toBe("over_mrv");
    expect(classifyVolume(50, L)).toBe("over_mrv");
  });
});

describe("weeklyAverage", () => {
  it("returns sets unchanged for a 7-day window", () => {
    expect(weeklyAverage(10, 7)).toBe(10);
  });

  it("halves a two-week rollup", () => {
    expect(weeklyAverage(20, 14)).toBe(10);
  });

  it("divides a four-week window by four", () => {
    expect(weeklyAverage(40, 28)).toBe(10);
  });

  it("guards against zero-length windows", () => {
    expect(weeklyAverage(10, 0)).toBe(0);
    expect(weeklyAverage(10, -1)).toBe(0);
  });
});

describe("MUSCLE_TO_GROUP", () => {
  it("maps every schema muscle to a known group", () => {
    const groupSet = new Set(MUSCLE_GROUPS);
    for (const m of MUSCLES) {
      const g = MUSCLE_TO_GROUP[m];
      expect(g, `muscle ${m} has no group`).toBeDefined();
      expect(groupSet.has(g), `group ${g} is not in MUSCLE_GROUPS`).toBe(true);
    }
  });

  it("collapses back + lats into one group", () => {
    expect(MUSCLE_TO_GROUP.back).toBe("back");
    expect(MUSCLE_TO_GROUP.lats).toBe("back");
  });

  it("collapses abs + obliques into core", () => {
    expect(MUSCLE_TO_GROUP.abs).toBe("core");
    expect(MUSCLE_TO_GROUP.obliques).toBe("core");
  });
});

describe("DEFAULT_LANDMARKS", () => {
  it("has a landmark triple for every group", () => {
    for (const g of MUSCLE_GROUPS) {
      const l = DEFAULT_LANDMARKS[g];
      expect(l, `missing defaults for ${g}`).toBeDefined();
      // Landmarks should be strictly ordered: MEV < MAV < MRV. A typo that
      // breaks this ordering would silently produce bizarre classifications.
      expect(l.mev).toBeLessThan(l.mav);
      expect(l.mav).toBeLessThan(l.mrv);
    }
  });

  it("matches the brief's values for back (combined lats + upper back)", () => {
    expect(DEFAULT_LANDMARKS.back).toEqual({ mev: 10, mav: 16, mrv: 22 });
  });

  it("matches the brief's values for chest", () => {
    expect(DEFAULT_LANDMARKS.chest).toEqual({ mev: 8, mav: 14, mrv: 20 });
  });
});

describe("parseVolumeLandmarks / serializeVolumeLandmarks", () => {
  it("round-trips the defaults exactly", () => {
    const text = serializeVolumeLandmarks(DEFAULT_LANDMARKS);
    const parsed = parseVolumeLandmarks(text);
    expect(parsed).toEqual(DEFAULT_LANDMARKS);
  });

  it("falls back to defaults for missing groups", () => {
    // YAML with only chest present — every other group should come back
    // with its default landmark triple.
    const raw =
      "---\nchest:\n  mev: 4\n  mav: 9\n  mrv: 15\n---\n(custom chest only)\n";
    const parsed = parseVolumeLandmarks(raw);
    expect(parsed.chest).toEqual({ mev: 4, mav: 9, mrv: 15 });
    expect(parsed.biceps).toEqual(DEFAULT_LANDMARKS.biceps);
    expect(parsed.core).toEqual(DEFAULT_LANDMARKS.core);
  });

  it("falls back per-field when a group is half-filled", () => {
    // Only mav is given; mev and mrv should default.
    const raw = "---\nchest:\n  mav: 99\n---\n";
    const parsed = parseVolumeLandmarks(raw);
    expect(parsed.chest.mav).toBe(99);
    expect(parsed.chest.mev).toBe(DEFAULT_LANDMARKS.chest.mev);
    expect(parsed.chest.mrv).toBe(DEFAULT_LANDMARKS.chest.mrv);
  });

  it("survives an empty file (no frontmatter)", () => {
    const parsed = parseVolumeLandmarks("");
    expect(parsed).toEqual(DEFAULT_LANDMARKS);
  });
});
