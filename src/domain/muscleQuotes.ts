// Per-muscle Imperium-praise quotes. Three per muscle.
//
// The Sanctum picks the muscle with the highest effective-set count in the
// current window (the "most-worked muscle") and displays one of its quotes
// above the body heatmap. Which of the three is shown rotates daily, via
// the same date-hash trick used on the Altar — so the user sees a stable
// quote across a day but a fresh one tomorrow.
//
// Tone: Warhammer 40k Imperial priest-speak. Heavy on oath, fire, duty.
// Quotes lean into the specific role each muscle plays in the warrior
// archetype (e.g. chest bears the Aquila, forearms grip the bolter,
// hamstrings drive the charge).

import type { Muscle } from "./schemas";

export const MUSCLE_QUOTES: Record<Muscle, string[]> = {
  chest: [
    "Upon this chest the Aquila is borne. Forge it into a bulwark worthy of the Throne.",
    "The pectorals of the faithful shield the heart — and the heart beats only for the Emperor.",
    "A hollow chest cannot house the Emperor's light. Fill it with iron.",
  ],
  back: [
    "The spine is the golden throne of the flesh. Let no heretic thought weaken it.",
    "A strong back carries the Emperor's banner through the void. Never let it bend.",
    "Between the shoulder blades the Emperor's gaze rests. Bear His weight proudly.",
  ],
  lats: [
    "The lats unfurl like the wings of the Aquila — spread them wide and cast the heretic's shadow.",
    "These are the wings of the Primarch's sons. Grow them, and you may yet shelter the faithful.",
    "Without lats, no Astartes draws bow nor swings chainsword. Forge them.",
  ],
  lower_back: [
    "A weak lumbar betrays the oath of vigilance. Steel yours like the pillars of Terra.",
    "The lower back is the foundation upon which all deeds stand. Neglect it and falter.",
    "Let the erectors hold you upright when lesser men bow. The Emperor remembers who stood.",
  ],
  quads: [
    "On these thighs the Legion marches ten thousand leagues. Build them of adamantium.",
    "The quads of a Guardsman are the bulwarks of the Imperium. Yours must be the same.",
    "When the retreat horn sounds, the faithful do not run — their quads refuse it.",
  ],
  hamstrings: [
    "The hamstrings drive the charge. Without them, the lance is merely ceremony.",
    "Train the rear of the thigh, for the Emperor's enemies strike as often from behind.",
    "A hammered leg is a hammered enemy. Forge the posterior chain.",
  ],
  glutes: [
    "The glutes are the throne from which every stride is launched. Build a throne of iron.",
    "Beware the warrior whose rear is weak — he has never truly carried the faith.",
    "A firm seat in the saddle wins the crusade. Cultivate the gluteus as a discipline.",
  ],
  calves: [
    "Calves of stone carry the faithful across hive worlds and ash plains alike. Harden them.",
    "The lower leg is oft-forgotten — the heretic notices, and flees first.",
    "The Emperor's marines are known by their silent, stone-hewn steps. Train the calf.",
  ],
  front_delts: [
    "The front deltoid raises the bolter to eye level. Without it, your aim is heresy.",
    "Lifted shields are lifted by these muscles. Do not forsake them.",
    "The frontal delt is the first to weary in battle — therefore the first to be forged.",
  ],
  side_delts: [
    "Upon the side delt the pauldron rests. Grow them, that your armour may never slip.",
    "Broad shoulders bear heavy oaths. Breadth begins here.",
    "The lateral deltoid is the silhouette of a true Astartes. Sculpt it in His image.",
  ],
  rear_delts: [
    "The rear deltoid draws the string, the blade, the oath. Do not leave it weak.",
    "Posterior shoulders are the quiet architects of posture. Honour them daily.",
    "When the Emperor calls you to stand straight, it is the rear delt that answers.",
  ],
  biceps: [
    "The bicep raises the chainsword. Let no son of the Emperor suffer a weak one.",
    "A curl for each fallen brother. Remember them in iron.",
    "By the bicep the enemy is dragged into His light. Build accordingly.",
  ],
  triceps: [
    "The tricep drives the bolter forward. Three heads, one purpose: to cleanse.",
    "Most of the arm is tricep. Most of the faithful forget this, to their eternal shame.",
    "A weak push is a weak oath. Forge the back of the arm.",
  ],
  forearms: [
    "By the forearm the grip is held. A slipped weapon is a slipped duty.",
    "The faithful never drop their bolter. Their forearms ensure it.",
    "Iron grip, iron faith. Train the forearm or forsake the field.",
  ],
  abs: [
    "The abdomen is the altar of the breath. Brace it, and you may yet outlast the foe.",
    "Without a firm core, the oath is hollow. Fill it with steel.",
    "The abs of the devoted are six-fold — one for each prayer before dawn.",
  ],
  obliques: [
    "By the obliques the blade swings true. Train them, or miss your mark.",
    "The side of the torso turns the warrior into a wheel of vengeance.",
    "Obliques are the twist of the chainsword's arc. Forge them and the enemy's head shall follow.",
  ],
};

// Fallback when nothing has been trained yet in the window (new user, or a
// long LoA). Keeps the header alive so the Sanctum never feels empty.
export const UNTRAINED_FALLBACK_QUOTE =
  "The flesh is silent. Awaken it, and the Emperor shall answer.";

// Given the current rollup, return the muscle with the most effective sets.
// Ties break by the order muscles appear in the MUSCLES tuple (stable and
// predictable rather than locale-sensitive alphabetical).
export function mostWorkedMuscle(
  rows: { muscle: Muscle; sets: number }[],
): Muscle | null {
  let best: { muscle: Muscle; sets: number } | null = null;
  for (const r of rows) {
    if (r.sets <= 0) continue;
    if (!best || r.sets > best.sets) best = r;
  }
  return best ? best.muscle : null;
}
