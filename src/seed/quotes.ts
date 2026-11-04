// Seed quotes. 25 pro-Emperor (rotated while in streak — affirming loyalty
// and the value of the work) and 25 disavowal (rotated when out of streak —
// the Imperium finding you wanting, beckoning you back to the altar).
//
// Written to `quotes/pro_emperor.json` and `quotes/disavowal.json` on first
// run. After that, edit the JSON freely in the vault — the plugin reads the
// user's copies, not this file.
//
// Cut from 50 each to 25. Fifty was padding: to reach that number the pool
// needed lines that were merely the SHAPE of a grimdark aphorism without a
// real thought inside — "a candle never asks whether the cathedral noticed",
// "faith is arriving on the appointed day". They scan as 40k and mean
// nothing, which is the uncanny-valley register the whole pool is written
// against. A smaller pool repeats sooner and reads better; repetition is a
// cheaper cost than a line that rings hollow.
//
// What survived the cut, as a rule for future edits:
//   - A concrete Imperial noun doing real work. "The Munitorum lost ten
//     million lasguns this week; you arrived on time" earns its place; "the
//     forge worlds grind on unthanked, so grind" does not, because the
//     second half is just the first half again.
//   - A thought that lands on its own. "Rust is quiet work." Four words,
//     no scaffolding.
//   - Praise delivered as paperwork, condemnation delivered as paperwork.
//     That gap is the joke and it never gets old.
//
// Still enforced:
//   - ONE SENTENCE each. The Altar renders these in a blockquote; a second
//     sentence wraps and loses the snap. Comma or semicolon for a turn.
//   - No ", which is ..." explanatory tag. It tells the reader what to think
//     about the joke they just read.
//   - Vary the length hard. Four-word lines next to sixteen-word lines.
//   - Disavowal belongs to Nurgle: warmth, comfort, rot, being loved exactly
//     as you are. No ALL CAPS; quiet menace is worse.

export const SEED_PRO_EMPEROR_QUOTES: string[] = [
  "Ten thousand years on the Throne, and He noticed your deadlift.",
  "A clerk stamped your name COMPLIANT and felt nothing.",
  "Duty is heavy by design.",
  "The Throne does not thank, it only fails to look away.",
  "Your muscles have no idea who they serve.",
  "Purity is a schedule, not a state of grace.",
  "The Imperium runs on people who turned up.",
  "Pain is data nobody will ever read.",
  "The saints were not stronger, only steadier, and then dead.",
  "Your body is Imperial property, kept to standard.",
  "The Munitorum lost ten million lasguns this week; you arrived on time.",
  "Iron keeps no faith, only numbers.",
  "The Emperor protects; the Administratum files.",
  "Heresy starts warm.",
  "Your ancestors starved so that you could choose to be tired.",
  "The Inquisition keeps a file on you and it is reassuringly thin.",
  "Discipline cannot be confiscated at the checkpoint.",
  "Faith without labour is gossip.",
  "A Guardsman gets fifteen hours at the front; you got a better evening.",
  "Something in the warp wanted you soft and went hungry.",
  "The flesh was weak; the weight moved.",
  "The Mechanicus would log you within tolerance, and from them that is a love letter.",
  "Somewhere a Commissar lowered his bolt pistol.",
  "The weight does not care how you felt about it.",
  "In nomine Imperatoris, the bar went up.",
];

export const SEED_DISAVOWAL_QUOTES: string[] = [
  "Nurgle loves you exactly as you are.",
  "You were devout tonight, at the wrong altar.",
  "A servitor with no frontal lobe finished its work today.",
  "The flesh made its case and you agreed.",
  "Your ancestors have been informed.",
  "Rest is allowed; comfort is the other thing.",
  "The purity seal has lifted at one corner.",
  "A Commissar wrote down a name and would not say whose.",
  "A Techpriest would log you DEGRADED and walk on.",
  "The weak are not punished, only uncounted.",
  "You said tomorrow; so did the Administratum, nine centuries ago.",
  "The plague-father asks nothing of anyone.",
  "Your body filed a complaint and you upheld it.",
  "A Guardsman held a trench eleven days on two ration packs.",
  "Heresy is a warm room and a good reason.",
  "Rust is quiet work.",
  "Status: ASSET, DORMANT.",
  "You did not fall, you settled.",
  "The saints fasted in hairshirts; you negotiated in a heated room.",
  "No roll call read your name.",
  "The garden of Nurgle is warm, fed, and made of corpses.",
  "Habits starve quietly.",
  "Not damned, only drifting.",
  "Rot never hurts at the start.",
  "Come back; the iron holds no grudge.",
];
