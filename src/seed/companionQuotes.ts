// Seed companion quotes — the Rogue Trader / Dark Heresy retinue's reactions
// to specific workout milestones. Each key corresponds to one achievement
// trigger in `src/domain/achievements.ts`; the pool under the key is picked
// from at random when the trigger fires.
//
// Shape differs from pro_emperor.json / disavowal.json: those are flat string
// arrays, these are {text, character} objects so the achievement card can
// attribute the line to a named companion. Written to
// `quotes/companion.json` on first install; after that, edit the JSON freely
// in the vault — the plugin reads the user's copy, not this file.

export type CompanionQuote = {
  text: string;
  character: string;
};

export type CompanionQuotes = {
  /** Five distinct exercises in a single session. */
  workout_complete: CompanionQuote[];
  /** Ten effective sets attributed to one muscle group in a single session. */
  ten_sets_muscle: CompanionQuote[];
  /** Fifteen effective sets attributed to one muscle group in a single session. */
  fifteen_sets_muscle: CompanionQuote[];
  /** Five separate cardio days inside a rolling 31-day window. A steady
   *  monthly habit rather than a heroic week — pitched warmly, not loudly. */
  five_cardio_month: CompanionQuote[];
  /** Rare weekly award — total effective sets across the last 7 days cross
   *  the 69-set threshold for the first time in this rolling window. One
   *  quote per companion; the card picks one at random so the user eventually
   *  hears from everyone. */
  rare_companion: CompanionQuote[];
  /** The plan's weekly success condition — a third session inside a rolling
   *  7-day window, i.e. one full turn of the push/pull/legs rotation. Warm
   *  and approving; this is the expected outcome of a good week, not a feat. */
  three_session_week: CompanionQuote[];
  /** The stretch condition — a fifth session in the same window. Pitched
   *  markedly higher than the three-session pool: these lines are meant to
   *  land as an event. */
  five_session_week: CompanionQuote[];
};

export const SEED_COMPANION_QUOTES: CompanionQuotes = {
  workout_complete: [
    { text: "Five disciplines, my lord, and not one of them skipped when the room emptied. I have served three generations of your line. Only one of them managed that.", character: "Abelard" },
    { text: "Five movements offered. The Emperor receives ten billion prayers an hour and almost none of them cost anything. Yours did.", character: "Argenta" },
    { text: "Five threads, and none of them frayed. I do not say that lightly — I watch things fray for a living.", character: "Cassia" },
    { text: "Five exercises. I came aboard expecting to find the rot in you. Five weeks of this and I shall have to write that I found none, which will please nobody and disappoint me personally.", character: "Heinrix" },
    { text: "Session complete. Five discrete movement patterns, adequate distribution. This unit notes that variety is what separates training from mere repetition, and that most of your species never learns the difference.", character: "Pasqal" },
    { text: "Five. Among my people a warrior trains for two centuries before anyone speaks of it. You have perhaps forty years. Use them at this pace and I may yet learn your name properly.", character: "Yrliet" },
    { text: "Five distinct disciplines in a single sitting! Oh, I do like a complete set. Incomplete sets keep me awake, and I do not sleep.", character: "Trazyn" },
    { text: "A full session, my lord, and the log is clean. No gaps, no creative arithmetic. The quartermasters would have wept.", character: "Abelard" },
    { text: "Five labours. The martyrs managed more, but they had the advantage of dying shortly afterwards.", character: "Argenta" },
    { text: "The pattern held from first movement to last. Warp-currents rarely manage that, and they have eternity to practise.", character: "Cassia" },
    { text: "Five exercises, logged honestly, including the ones that went badly. The honesty is the part I would testify to.", character: "Heinrix" },
    { text: "Muscular coverage: broad. Compliance with stated intent: total. This unit has recalibrated its expectations of you upward. Again.", character: "Pasqal" },
    { text: "You did the whole of it, not the enjoyable half. Your kind almost never does the second half.", character: "Yrliet" },
    { text: "The rite was observed in full. The Emperor does not lack for grand gestures — He lacks for people who finish.", character: "Argenta" },
    { text: "Five. I felt the shape of it from the helm: a beginning, a middle, and an actual end. Most mortal intentions have only the first.", character: "Cassia" },
    { text: "A complete session. Unremarkable, and I mean that as the highest compliment available to a seneschal.", character: "Abelard" },
    { text: "Full compliance, no deviation, no theatrics. I have condemned men for less and acquitted almost no one for more.", character: "Heinrix" },
    { text: "Five disciplines. I am labelling the display case now — Rogue Trader, Late Period, Notably Consistent. It will sit between a primarch's gauntlet and a very disappointing crown.", character: "Trazyn" },
    { text: "Every exercise attempted was an exercise completed. That ratio is rarer than gene-seed, and considerably harder to steal.", character: "Pasqal" },
  ],

  ten_sets_muscle: [
    { text: "Ten proper sets. A thorough effort, my lord. The old quartermasters would have approved.", character: "Abelard" },
    { text: "Ten sets devoted to one part of the temple of your body. The Emperor takes notice.", character: "Argenta" },
    { text: "Ten threads woven into the same pattern. The design is holding.", character: "Cassia" },
    { text: "Ten sets. Not the behavior of a man with something to hide.", character: "Heinrix" },
    { text: "Ten sets on the same muscle. A disciplined focus. Your saints would recognize it.", character: "Argenta" },
    { text: "Ten sets, same focus, same purpose. I have seen warp-currents flow with less coherence.", character: "Cassia" },
    { text: "Volume target achieved. Ten discrete input events, consistent output. Adequate.", character: "Pasqal" },
    { text: "Ten sets. A sufficient offering. I have seen mon'keigh manage less with more noise.", character: "Yrliet" },
    { text: "Ten sets on one muscle. Delightful specificity. I shall label this drawer accordingly.", character: "Trazyn" },
    { text: "A proper volume, steadily delivered. The log pleases me, my lord.", character: "Abelard" },
    { text: "Each set a candle. Ten flames burning steady. The chapel of your effort is well-lit.", character: "Argenta" },
    { text: "The pattern held through ten repetitions of intent. That is not chance.", character: "Cassia" },
    { text: "Ten sets with no shortcuts that I detected. I did look.", character: "Heinrix" },
    { text: "Ten sets. Volume sufficient for measurable stimulus. Continue.", character: "Pasqal" },
    { text: "Stimulus parameters: appropriate. Recovery protocol engaged. Efficiency: noted.", character: "Pasqal" },
    { text: "Ten. The number of completed vows required for pilgrim status in my order. You would have passed the trial.", character: "Argenta" },
    { text: "The pattern thickens. Ten strands make a rope; ten ropes make a hawser. You are learning to hold weight you have not yet met.", character: "Cassia" },
  ],

  fifteen_sets_muscle: [
    { text: "Fifteen sets, my lord. A campaign's worth of effort in a single day. I am genuinely proud.", character: "Abelard" },
    { text: "Fifteen sets. The endurance of the martyrs flows through you. The Emperor SEES.", character: "Argenta" },
    { text: "Fifteen strands, all woven into one purpose. The tapestry gleams. I felt it from the helm.", character: "Cassia" },
    { text: "Fifteen sets. I've investigated saints who did less. My suspicion is replaced with something uncomfortably like admiration.", character: "Heinrix" },
    { text: "Fifteen sets. The kind of volume that separates the devout from the merely dutiful. You are the first today.", character: "Argenta" },
    { text: "Fifteen. I felt your focus from leagues away. It has the weight of a small prayer sustained.", character: "Cassia" },
    { text: "Volume threshold: exceptional. Recommend: celebration protocol. Praise: sincere.", character: "Pasqal" },
    { text: "Fifteen. Even among my own kind this would be called dedication. You have earned the word today.", character: "Yrliet" },
    { text: "Oh, magnificent. Fifteen sets. This single workout is worth a pedestal. I am already naming the placard.", character: "Trazyn" },
    { text: "A session of genuine distinction, my lord. The kind entered into family histories.", character: "Abelard" },
    { text: "Fifteen sets, fifteen prayers said through the flesh. The cathedral of your body grows another spire.", character: "Argenta" },
    { text: "The warp does not often notice mortal effort. It noticed this.", character: "Cassia" },
    { text: "Fifteen sets. A number that forces a rewrite of my assumptions about you.", character: "Heinrix" },
    { text: "Hypertrophic stimulus: maximum. Data suggests adaptive response inevitable. This unit expresses approval.", character: "Pasqal" },
    { text: "Fifteen. The specimen is rare. I shall preserve this moment with particular care.", character: "Trazyn" },
    { text: "Fifteen sets. There are hymns shorter than this act of devotion. I have been singing one of them under my breath.", character: "Argenta" },
    { text: "Fifteen. The number at which the warp begins to recognize intent as character. You are becoming someone recognizable.", character: "Cassia" },
  ],

  five_cardio_month: [
    { text: "Five marches on the month's ledger, my lord. Not a burst of enthusiasm — a habit. Habits are what survive a campaign.", character: "Abelard" },
    { text: "Five times this month you went out with nothing but your own breath for company. The Emperor counts the quiet offerings too.", character: "Argenta" },
    { text: "Five marches across the month. Spaced, deliberate, unhurried. That shape is harder to hold than a single hard week.", character: "Cassia" },
    { text: "Five cardio days this month. Consistent enough to be a pattern, which in my profession is the highest praise I give.", character: "Heinrix" },
    { text: "Monthly cardio frequency: five. Sustainable. Repeatable. This unit prefers sustainable to spectacular, and says so rarely.", character: "Pasqal" },
    { text: "Five over a month. Your kind burns bright and stops. You did neither. I have adjusted my expectations, quietly.", character: "Yrliet" },
    { text: "Five marches in a single month — the steady sort of devotion. Far less dramatic than a heroic week, and far more likely to end up in my collection intact.", character: "Trazyn" },
    { text: "Five this month, my lord. The lungs have been asked their question often enough to answer properly now.", character: "Abelard" },
    { text: "Five roads walked. The pilgrimage is not one long march but many small ones. You have understood the shape of it.", character: "Argenta" },
    { text: "Five threads of breath laid down across the month. The weave holds because the strands are evenly spaced.", character: "Cassia" },
    { text: "Five cardio days inside thirty-one. Adaptation follows frequency, not intensity. You have chosen correctly, whether or not you meant to.", character: "Pasqal" },
    { text: "Five marches this month. Keep to that and the Emperor will not need to be impressed — He will simply be able to rely on you.", character: "Argenta" },
  ],

  // 69 effective sets across the last seven days — a rare campaign. One
  // quote per companion so the user eventually hears from the whole
  // retinue as the weeks accumulate.
  rare_companion: [
    { text: "Sixty-nine sets in seven days, my lord. In my Navy years we called that a full month's work compressed into a single deployment. I am, quite genuinely, without a dry remark.", character: "Abelard" },
    { text: "Sixty-nine sets. A campaign of the flesh. The saints themselves did not always sustain such weeks. The Emperor sees you, and I weep a little, privately, at the shape of your devotion.", character: "Argenta" },
    { text: "I watched the pattern thicken for seven days. It did not fray. It did not hurry. Sixty-nine sets, held as one long thought. Among my people that is the weight of a sung name.", character: "Cassia" },
    { text: "Sixty-nine sets in a week. That is the volume of a man building an alibi, or a man building a body. My files suggest the latter. I am, for once, pleased to be reassured.", character: "Heinrix" },
    { text: "Weekly volume: sixty-nine effective sets. Deviation from mortal baseline: substantial. Recommendation: this unit acquires a small flag for the occasion. Acquisition complete.", character: "Pasqal" },
    { text: "Sixty-nine. I counted. I rarely count mon'keigh effort. Understand what that means. You have moved from specimen to — something nearer a name.", character: "Yrliet" },
    { text: "Sixty-nine sets across one terrestrial week. Oh, splendid, splendid — I am clearing a plinth. No, two. A diorama, I think. The Emperor's most devoted may yet end up in my collection.", character: "Trazyn" },
  ],

  three_session_week: [
    { text: "Three sessions this week, my lord. The rotation has turned once, entire. That is the whole of what was asked, and you have given it.", character: "Abelard" },
    { text: "Push, pull, legs. The full circuit, offered in seven days. This is what devotion looks like when it stops being dramatic and starts being kept.", character: "Argenta" },
    { text: "The pattern closed on itself this week. Three threads, and the loop is whole. I find it restful to watch.", character: "Cassia" },
    { text: "Three sessions in seven days. That is the plan, met exactly. I have built cases on less consistent behavior. Approvingly, this time.", character: "Heinrix" },
    { text: "Weekly session count: three. Target: three. Variance: zero. This unit registers a state approximating satisfaction.", character: "Pasqal" },
    { text: "Three days out of seven you did the thing you said you would. Among your kind that is nearly remarkable. Among mine it is merely correct. Take the compliment as you find it.", character: "Yrliet" },
    { text: "A complete rotation, tidily executed. Rather like a matched set. I do so appreciate a matched set.", character: "Trazyn" },
    { text: "The week holds, my lord. Nothing dropped, nothing owed. A quartermaster's favorite kind of ledger.", character: "Abelard" },
    { text: "Three offerings, evenly spaced. The Emperor has never asked for more than what is promised — only that what is promised arrives.", character: "Argenta" },
    { text: "You returned three times. The warp remembers returns more clearly than arrivals.", character: "Cassia" },
    { text: "The rotation turned once. Push, pull, legs — every muscle spoken to, none neglected. The design worked because you let it.", character: "Pasqal" },
    { text: "Three. The number of vows a novice keeps before the order will believe the fourth. You have been believed.", character: "Argenta" },
  ],

  five_session_week: [
    { text: "FIVE sessions, my lord. Five. I have served three generations of your line and I have not written that number into a week's log before. I am — forgive me — genuinely moved.", character: "Abelard" },
    { text: "FIVE. The rotation turned once and then reached for more. This is no longer discipline, my lord — this is fervor, and the Emperor's own gaze has turned fully upon it. I would follow you into any fire this week.", character: "Argenta" },
    { text: "Five returns in seven days. The pattern did not merely hold — it doubled back and reinforced itself. I have seen warp-storms with less will behind them. I felt this one from the helm, and I am not easily reached.", character: "Cassia" },
    { text: "Five sessions. I came to this ship to find the flaw in you. Five weeks of this and I will have to file that I found none. Do you understand how rare that report is? Do not make me write it twice.", character: "Heinrix" },
    { text: "Weekly session count: FIVE. Exceeds target by sixty-six percent. This unit has recalculated its model of you three times and discarded each. Recommendation: continue. Emotional subroutine: engaged, unashamedly.", character: "Pasqal" },
    { text: "Five. I have watched mon'keigh for longer than your bloodline has held its name, and I have not often had cause to stop and look properly. This week I looked properly. Do not ask me to say more.", character: "Yrliet" },
    { text: "FIVE sessions in a single week — oh, this is museum-grade. I am rewriting the placard, moving the exhibit to the central hall, and evicting a minor primarch's gauntlet to make room. Congratulations. You have become collectible.", character: "Trazyn" },
    { text: "Five days under the iron, my lord. Your ancestors managed campaigns on less. I shall be insufferable about this at the officers' table and I make no apology.", character: "Abelard" },
    { text: "Five. The rotation, and then two more offerings freely given. Nothing demanded them. That is what makes them holy.", character: "Argenta" },
    { text: "Five threads in seven days, each one deliberate. The tapestry has a bright place now where this week sits. It will still be bright when the year is woven.", character: "Cassia" },
    { text: "Five sessions. Statistically, this is the week that separates the trajectory you're on from the one you were on. I have flagged it in the record as a discontinuity. In your idiom: something changed here.", character: "Pasqal" },
    { text: "Five. Even the martyrs rested on the seventh day and you have nearly filled the other six. Rest, my lord — I say it as a warning and as praise both. The Emperor prefers His faithful alive.", character: "Argenta" },
  ],
};
