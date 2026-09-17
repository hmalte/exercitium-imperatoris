// Unit conversion + formatting tests.
//
// The core worry here is round-trip stability: if the user types "176.4 lb"
// we convert to kg for storage, and on next view we convert back for display.
// A bug that introduces cumulative drift would be silently wrong. These
// tests exercise both directions and a few edge cases (empty input, NaN,
// zero-trim formatting).

import { describe, expect, it } from "vitest";
import {
  KG_PER_LB,
  displayToKg,
  formatWeight,
  formatWeightInput,
  kgToDisplay,
  parseInputWeight,
  unitLabel,
} from "./units";

describe("unit conversion", () => {
  it("kgToDisplay is identity in kg mode", () => {
    expect(kgToDisplay(80, "kg")).toBe(80);
    expect(kgToDisplay(0, "kg")).toBe(0);
    expect(kgToDisplay(17.5, "kg")).toBe(17.5);
  });

  it("kgToDisplay converts to lb using the exact avoirdupois factor", () => {
    // 80 kg × (1 / 0.45359237) ≈ 176.3698 lb
    expect(kgToDisplay(80, "lb")).toBeCloseTo(176.3698, 3);
    expect(kgToDisplay(1, "lb")).toBeCloseTo(2.20462262, 6);
    expect(kgToDisplay(0, "lb")).toBe(0);
  });

  it("displayToKg is identity in kg mode", () => {
    expect(displayToKg(80, "kg")).toBe(80);
  });

  it("displayToKg converts lb back to kg", () => {
    // 176.3698 lb × 0.45359237 ≈ 80 kg
    expect(displayToKg(176.3698, "lb")).toBeCloseTo(80, 3);
    expect(displayToKg(2.20462262, "lb")).toBeCloseTo(1, 6);
  });

  it("round-trips kg → lb → kg without drift", () => {
    for (const kg of [0, 1, 17.5, 80, 140, 250]) {
      const roundTripped = displayToKg(kgToDisplay(kg, "lb"), "lb");
      expect(roundTripped).toBeCloseTo(kg, 9);
    }
  });

  it("KG_PER_LB matches the exact international definition", () => {
    expect(KG_PER_LB).toBe(0.45359237);
  });
});

describe("parseInputWeight", () => {
  it("returns null for empty string", () => {
    expect(parseInputWeight("", "kg")).toBe(null);
    expect(parseInputWeight("   ", "kg")).toBe(null);
  });

  it("returns null for non-numeric input", () => {
    expect(parseInputWeight("abc", "kg")).toBe(null);
    expect(parseInputWeight("--", "lb")).toBe(null);
  });

  it("returns the kg value unchanged in kg mode", () => {
    expect(parseInputWeight("80", "kg")).toBe(80);
    expect(parseInputWeight("17.5", "kg")).toBe(17.5);
  });

  it("converts lb input to kg", () => {
    expect(parseInputWeight("176.3698", "lb")).toBeCloseTo(80, 3);
    expect(parseInputWeight("220", "lb")).toBeCloseTo(99.79, 2);
  });

  it("handles partial numeric prefixes via parseFloat", () => {
    // parseFloat tolerates trailing garbage — mirrors how the rest of the
    // code uses parseFloat on user-typed numeric fields today.
    expect(parseInputWeight("80kg", "kg")).toBe(80);
    expect(parseInputWeight("200.5 extra", "lb")).toBeCloseTo(90.95, 2);
  });
});

describe("formatWeight", () => {
  it("renders kg with the kg suffix", () => {
    expect(formatWeight(80, "kg")).toBe("80 kg");
    expect(formatWeight(17.5, "kg")).toBe("17.5 kg");
    expect(formatWeight(100, "kg", 0)).toBe("100 kg");
  });

  it("renders lb with the lb suffix and 1-decimal default", () => {
    expect(formatWeight(80, "lb")).toBe("176.4 lb");
    expect(formatWeight(1, "lb", 2)).toBe("2.2 lb");
    expect(formatWeight(0, "lb")).toBe("0 lb");
  });

  it("trims trailing zeroes on the fractional part", () => {
    expect(formatWeight(100, "kg", 2)).toBe("100 kg");
    expect(formatWeight(17.5, "kg", 2)).toBe("17.5 kg");
  });

  it("respects the explicit decimals override", () => {
    expect(formatWeight(80, "lb", 3)).toBe("176.37 lb");
    expect(formatWeight(80, "lb", 0)).toBe("176 lb");
  });
});

describe("formatWeightInput", () => {
  it("returns a plain number string without the unit suffix", () => {
    expect(formatWeightInput(80, "kg")).toBe("80");
    expect(formatWeightInput(80, "lb")).toBe("176.4");
    expect(formatWeightInput(17.5, "kg")).toBe("17.5");
  });

  it("handles the 0 case cleanly", () => {
    expect(formatWeightInput(0, "kg")).toBe("0");
    expect(formatWeightInput(0, "lb")).toBe("0");
  });
});

describe("unitLabel", () => {
  it("returns kg or lb", () => {
    expect(unitLabel("kg")).toBe("kg");
    expect(unitLabel("lb")).toBe("lb");
  });
});
