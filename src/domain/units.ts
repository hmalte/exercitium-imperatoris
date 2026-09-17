// Display-unit helpers for weight values.
//
// Internal storage is ALWAYS kilograms — every `weight_kg` / `bodyweight_kg`
// field on disk, every number flowing through progression, volume, stats,
// etc. is kg. The display unit is purely a presentation-layer concern:
//   • When rendering a stored kg to the user → formatWeight(kg, unit)
//   • When parsing a user-typed number → parseInputWeight(input, unit)
//     returns kg (convertingfrom lbs if the user is in lbs mode).
//
// Keeping the conversion at the UI edge means a user can flip between kg
// and lbs as often as they like without mutating a single byte on disk.
// The vault file for a 80 kg bench press stays "80" in kg whether the
// UI shows "80 kg" or "176.4 lb".

/**
 * Unit the user chose to see + enter numbers in. Defaults to kg — the
 * "imperial measures" (lbs) setting is the grimdark-flavored opt-in.
 */
export type DisplayUnit = "kg" | "lb";

/**
 * Exact kg → lb factor. This is the internationally-agreed-upon avoirdupois
 * pound definition (1 lb = 0.45359237 kg exactly). Using the exact value
 * avoids rounding drift when the user toggles back and forth.
 */
export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 1 / KG_PER_LB; // ~2.20462262

/**
 * Convert a weight in kg to the user's display unit. The value returned is
 * a plain number (so consumers can still round or format freely) — use
 * `formatWeight` if you want a rendered string with the unit suffix.
 */
export function kgToDisplay(kg: number, unit: DisplayUnit): number {
  return unit === "lb" ? kg * LB_PER_KG : kg;
}

/**
 * Convert a user-entered number (in `unit`) back to kg for storage or
 * downstream math. `NaN` is returned untouched so parsing callers can
 * detect invalid input the same way they do today.
 */
export function displayToKg(value: number, unit: DisplayUnit): number {
  if (!Number.isFinite(value)) return value;
  return unit === "lb" ? value * KG_PER_LB : value;
}

/**
 * Parse a string the user typed into an input and return the kg value for
 * storage. Returns null for empty / non-numeric input. The caller chooses
 * what to do with null (e.g. treat as "skipped").
 */
export function parseInputWeight(
  input: string,
  unit: DisplayUnit,
): number | null {
  if (input.trim() === "") return null;
  const n = parseFloat(input);
  if (!Number.isFinite(n)) return null;
  return displayToKg(n, unit);
}

/**
 * Short unit label for UI chrome ("kg" or "lb"). Kept as a helper so that
 * every place in the codebase uses the same abbreviation.
 */
export function unitLabel(unit: DisplayUnit): string {
  return unit === "lb" ? "lb" : "kg";
}

/**
 * Format a kg weight as a string with the unit suffix: "80 kg", "176.4 lb".
 *
 * Decimals default to 1 for lb (so 80 kg → "176.4 lb" instead of the noisy
 * "176.369..." or the too-coarse "176 lb") and 0.1-step-precision for kg
 * with trailing zeroes trimmed. If you need a different precision pass
 * `decimals` explicitly — useful for chart tooltips where you want
 * integers ("80 kg") vs set logs where you want decimals ("17.5 kg").
 */
export function formatWeight(
  kg: number,
  unit: DisplayUnit,
  decimals?: number,
): string {
  const v = kgToDisplay(kg, unit);
  const d = decimals ?? (unit === "lb" ? 1 : 1);
  return `${trimZero(v.toFixed(d))} ${unitLabel(unit)}`;
}

/**
 * Format a stored kg weight as a plain number string (no unit suffix) —
 * useful for prefilling a numeric input with the converted value. The
 * output is suitable to hand straight to `<input value={...} />`.
 */
export function formatWeightInput(
  kg: number,
  unit: DisplayUnit,
  decimals = 1,
): string {
  return trimZero(kgToDisplay(kg, unit).toFixed(decimals));
}

/**
 * "80.0" → "80"; "17.50" → "17.5"; "0.00" → "0". Keeps form inputs and
 * labels tidy without forcing integers.
 */
function trimZero(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}
