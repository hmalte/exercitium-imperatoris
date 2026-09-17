// Seed quotes. 50 pro-Emperor (rotated while in streak — affirming loyalty
// and the value of the work) and 50 disavowal (rotated when out of streak —
// the Imperium finding you wanting, beckoning you back to the altar).
//
// Written to `quotes/pro_emperor.json` and `quotes/disavowal.json` on first
// run. After that, edit the JSON freely in the vault — the plugin reads the
// user's copies, not this file.
//
// Craft rules. The first draft of these read as machine-written, and the
// specific reasons are worth writing down so the next edit does not drift
// back into them:
//
//   - NO ", which is ..." tag. The explanatory appositive was on 14 of 100
//     lines and it is the loudest tell there is. "Nurgle loves you exactly
//     as you are, which is the entire problem" is weaker than stopping at
//     "as you are" — the reader supplies the problem, and resents being
//     told. Cap: two across both pools.
//   - VARY THE LENGTH HARD. The old pool ran 9-20 words with a standard
//     deviation of 2.2, so every line had the same shape and the pool read
//     as one voice reciting. Four-word lines next to twenty-word lines is
//     what human writing looks like.
//   - Not every line needs an ironic turn. A flat statement — "Habits
//     starve quietly" — lands harder than the same thought with a wry coda
//     bolted on. Roughly a third should just stop.
//   - Cut the padding adverbs: whatsoever, regardless, considerably,
//     approximately, wholly, notoriously, precisely, entirely.
//   - Ration the "not X but Y" antithesis. Twice per pool, not six times.
//   - ONE SENTENCE each. The Altar renders these in a blockquote; a second
//     sentence wraps and loses the snap. Use a comma or semicolon for a
//     turn, never a full stop.
//   - Specificity beats grandeur, and the Imperium is badly run: praise
//     arrives as paperwork and so does damnation.
//   - Disavowal belongs to Nurgle — warmth, comfort, rot, being loved
//     exactly as you are. No ALL CAPS; quiet menace is worse.

export const SEED_PRO_EMPEROR_QUOTES: string[] = [
  "Ten thousand years on the Throne, and He noticed your deadlift.",
  "A clerk stamped your name COMPLIANT and felt nothing.",
  "Sweat is the one fluid the Imperium never thought to ration.",
  "Duty is heavy by design.",
  "Nine hundred billion souls did nothing today; you did not.",
  "The Throne does not thank, it only fails to look away.",
  "Your muscles have no idea who they serve.",
  "Purity is a schedule, not a state of grace.",
  "The tally of the faithful moved by one tonight.",
  "Steel comes from ore, faith from repetitions.",
  "The Imperium runs on people who turned up.",
  "Pain is data nobody will ever read.",
  "The saints were not stronger, only steadier, and then dead.",
  "Every set is a small refusal.",
  "Your body is Imperial property, kept to standard.",
  "The Munitorum lost ten million lasguns this week; you arrived on time.",
  "A candle never asks whether the cathedral noticed.",
  "Iron keeps no faith, only numbers.",
  "There is a line in a ledger that is you, and tonight it grew.",
  "The Emperor protects; the Administratum files.",
  "Heresy starts warm.",
  "The forge worlds grind on unthanked, so grind.",
  "One cog turned cleanly tonight.",
  "Your ancestors starved so that you could choose to be tired.",
  "The Inquisition keeps a file on you and it is reassuringly thin.",
  "Discipline cannot be confiscated at the checkpoint.",
  "Faith without labour is gossip.",
  "The Golden Throne fails by inches and holds anyway.",
  "A Guardsman gets fifteen hours at the front; you got a better evening.",
  "The machine spirit of the barbell is appeased for now.",
  "Nobody will remember this, and the Palace walls held anyway.",
  "Something in the warp wanted you soft and went hungry.",
  "No one drafted you into this.",
  "Faith is arriving on the appointed day.",
  "Ten billion prayers an hour reach Terra and almost none of them cost anything.",
  "The flesh was weak; the weight moved.",
  "The Astronomican burned steady over you.",
  "A Techpriest anoints engines that outlive him; tonight you did the same.",
  "Rest is the antechamber of heresy and you walked straight through.",
  "A Sister of Battle would call this devotion and still want more.",
  "The Mechanicus would log you within tolerance, and from them that is a love letter.",
  "You chose the harder morning, and the Throne cannot manufacture those.",
  "Flesh is a tithe; you paid it in full.",
  "Somewhere a Commissar lowered his bolt pistol.",
  "Your gene-line was ordinary until you started arguing with it.",
  "Suffering sanctifies, so you are a little holier than this morning.",
  "The weight does not care how you felt about it.",
  "Ten worlds burn tonight and one man lifted; the ledger is strange but it is kept.",
  "Comfort is how it begins, and you did not begin.",
  "In nomine Imperatoris, the bar went up.",
];

export const SEED_DISAVOWAL_QUOTES: string[] = [
  "Nurgle loves you exactly as you are.",
  "You were devout tonight, at the wrong altar.",
  "A servitor with no frontal lobe finished its work today.",
  "The flesh made its case and you agreed.",
  "Nurgle keeps a ledger too, and you are in credit.",
  "Your ancestors have been informed.",
  "His gaze moved on and is in no hurry back.",
  "Rest is allowed; comfort is the other thing.",
  "The purity seal has lifted at one corner.",
  "The Imperium gained nothing from you tonight.",
  "A Commissar wrote down a name and would not say whose.",
  "Appetite and inertia feed the warp, and you tithed.",
  "A Techpriest would log you DEGRADED and walk on.",
  "The weak are not punished, only uncounted.",
  "Ten thousand years of decline, and you did your bit.",
  "You said tomorrow; so did the Administratum, nine centuries ago.",
  "The plague-father asks nothing of anyone.",
  "Your body filed a complaint and you upheld it.",
  "The Astronomican stopped needing to find you.",
  "A Guardsman held a trench eleven days on two ration packs.",
  "Heresy is a warm room and a good reason.",
  "He burns on the Throne for mankind; you were tired.",
  "Rust is quiet work.",
  "The Ecclesiarchy has a word for the faithful-tomorrow.",
  "Your machine spirit is sulking.",
  "Status: ASSET, DORMANT.",
  "No daemon came for you; none was needed.",
  "You did not fall, you settled.",
  "Slaanesh notices anyone who learns how good stopping feels.",
  "The hive ran slightly worse tonight.",
  "The saints fasted in hairshirts; you negotiated in a heated room.",
  "A cog that does not turn is debris.",
  "No roll call read your name.",
  "The garden of Nurgle is warm, fed, and made of corpses.",
  "The Imperium will not notice, it rarely does.",
  "Tomorrow is what the Perdita worlds said.",
  "The scales weighed you and found yesterday.",
  "Sloth has never needed investigating.",
  "There was a version of tonight where you went.",
  "The flesh wins most evenings and waits out the rest.",
  "One generation of resolve, thinner.",
  "A thousand psykers burned today; your excuse has been filed.",
  "Habits starve quietly.",
  "Call it recovery if it was planned, and it was not.",
  "The candle ran out of being lit.",
  "A scribe and a Guardsman did their duty tonight without wanting to.",
  "The Emperor protects, but He will not lift for you.",
  "Not damned, only drifting.",
  "Rot never hurts at the start.",
  "Come back; the iron holds no grudge.",
];
