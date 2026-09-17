// Unit tests for the named-rotation preset registry.
//
// Most of the behavior is data — the interesting function is
// resolveRotationPreset, which has to cope with arbitrary strings
// (hand-edited data.json, typos, legacy keys). We verify it defaults
// cleanly instead of throwing, and that each shipped preset declares
// the shape the Altar + Ritual depend on.

import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROTATION_PRESET,
  ROTATION_PRESETS,
  ROTATION_PRESET_IDS,
  resolveRotationPreset,
} from "./rotationPresets";

describe("ROTATION_PRESETS", () => {
  it("ships the one expected preset keyed by ID", () => {
    expect(ROTATION_PRESET_IDS).toEqual(["astartes"]);
    for (const id of ROTATION_PRESET_IDS) {
      expect(ROTATION_PRESETS[id].id).toBe(id);
      expect(ROTATION_PRESETS[id].order.length).toBeGreaterThan(0);
    }
  });

  it("has astartes = 3-day push/pull/legs", () => {
    expect(ROTATION_PRESETS.astartes.order).toEqual(["push", "pull", "legs"]);
  });

  it("declares astartes as the default", () => {
    expect(DEFAULT_ROTATION_PRESET).toBe("astartes");
  });
});

describe("resolveRotationPreset", () => {
  it("returns the exact preset for a known ID", () => {
    expect(resolveRotationPreset("astartes").id).toBe("astartes");
  });

  // The retired presets are the realistic case here: a data.json written
  // before the rotation narrowed to three days still names one of them, and
  // must heal rather than error.
  it("heals a data.json still naming a retired preset", () => {
    expect(resolveRotationPreset("litany").id).toBe("astartes");
    expect(resolveRotationPreset("sanguinary").id).toBe("astartes");
  });

  it("falls back to the default for unknown values", () => {
    expect(resolveRotationPreset("not-a-real-preset").id).toBe(
      DEFAULT_ROTATION_PRESET,
    );
    expect(resolveRotationPreset("").id).toBe(DEFAULT_ROTATION_PRESET);
  });

  it("falls back to the default for nullish values", () => {
    expect(resolveRotationPreset(null).id).toBe(DEFAULT_ROTATION_PRESET);
    expect(resolveRotationPreset(undefined).id).toBe(DEFAULT_ROTATION_PRESET);
  });
});
