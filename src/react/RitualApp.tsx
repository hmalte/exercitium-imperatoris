// The Ritual — the active-workout UI.
//
// State machine:
//   "loading"         → fetching sessions, exercises, LoAs, quotes
//   "cardio_choice"   → only shown when cardio week is due; offer the deload
//   "cardio"          → cardio-week flow: notes + sleep, no strength logging
//   "sleep"           → ask for sleep hours (skippable)
//   "logging"         → slot banner + exercise menu; pick exercises + log sets;
//                       "End the Ritual" advances to cleanse
//   "cleanse"         → "Cleanse the Flesh": sauna, steam, or skip. Replaced
//                       the old post-workout cardio finisher, which went
//                       unused — cardio is logged as its own session now.
//   "cleanse_quote"   → shows a pro-emperor quote (if cleansed) or a
//                       disavowal quote (if skipped); single Continue button
//   "weigh"           → "Weight of the Flesh" bodyweight input; the button
//                       "Exit the Exercitium" triggers the actual save
//   "saving"          → brief state while writing session.md
//   "done"            → confirmation, view closes itself shortly
//
// Bodyweight is captured at the END of the workout (the user weighs in post-
// workout), not at the start. Cardio is a finishing step rather than a
// precondition — the quote rewards consistency or calls out skipping.

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { StepBackBar } from "./BackBar";
import type { VaultAdapter } from "../domain/vault";
import {
  loadAllExercises,
  loadAllLoAs,
  loadAllSessions,
  loadCompanionQuotes,
  loadQuotes,
  saveSession,
} from "../domain/vault";
import { detectAchievements, type Achievement } from "../domain/achievements";
import type { CompanionQuotes } from "../seed/companionQuotes";
import type {
  CardioType,
  CleanseType,
  ExerciseFile,
  LoAFile,
  SessionFile,
  SetEntry,
} from "../domain/schemas";
import {
  DEFAULT_TARGET_SETS,
  ROTATION_SLOTS,
  type Equipment,
  type RotationOrderSlot,
  type RotationSlot,
} from "../domain/schemas";
import {
  deriveCardioWeekRanges,
  isCardioWeekDue,
  isInLeaveOfAbsence,
  nextRotationPosition,
  type LoA,
  type Session,
} from "../domain/timeLogic";
import {
  clearRitualDraft,
  loadRitualDraft,
  saveRitualDraft,
  type RitualDraft,
} from "../domain/sessionDraft";
import { suggestNext } from "../domain/progression";
import { bestEpleyForExercise, epleyOneRepMax } from "../domain/stats";
import { lastRecordedBodyweight } from "../domain/volume";
import {
  type DisplayUnit,
  formatWeight,
  formatWeightInput,
  parseInputWeight,
  unitLabel,
} from "../domain/units";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** How the Ritual view was launched. See RitualAppProps.mode. */
export type RitualMode = "auto" | "cardio_only";

export type RitualAppProps = {
  adapter: VaultAdapter;
  /** Today in ISO format — passed in (rather than computed) so the view is
   *  deterministic in tests and predictable if the user opens it near midnight. */
  today: string;
  /** Unit the user has chosen for weight display + entry. Storage stays
   *  kg regardless; conversion happens at every input/output boundary in
   *  this component via the units.ts helpers. */
  displayUnit: DisplayUnit;
  /** The resolved rotation slot order for the active preset. May include
   *  "cardio" (Sanguinary Split's fixed cardio day). Drives which slot
   *  the Ritual lands on for the current rotation position. */
  rotationOrder: RotationOrderSlot[];
  /** Default progression increment in kg per equipment kind. Fed to
   *  suggestNext so a 5 kg machine stack doesn't get a 2.5 kg microplate
   *  suggestion, and vice versa. */
  incrementsKg: Record<Equipment, number>;
  /** How the Ritual was entered.
   *
   *  "auto"        — normal: draft recovery, then cardio-week check, then the
   *                  rotation's slot for today.
   *  "cardio_only" — the user tapped "The Lungs Alone" on the Altar. Skips
   *                  straight to the cardio session step; saves a lift-free
   *                  session that does NOT advance the rotation. */
  mode?: RitualMode;
  /** Called after the session is saved. View uses this to close itself. */
  onComplete: () => void;
  /** Called when the user backs out of the Ritual BEFORE saving — the back
   *  control on the first step. The view navigates to the Altar. Distinct
   *  from onComplete: nothing has been written, and the autosaved draft is
   *  left in place so re-entering offers the work back. */
  onExit: () => void;
};

// An exercise the user has chosen to work on this session, with its sets.
type WorkingExercise = {
  exerciseId: string;
  displayName: string;
  bodyweight: boolean;
  sets: SetEntry[];
  /** User declared this lift finished for the session. Hides its input row
   *  and its next-set suggestion, so a completed exercise stops asking for
   *  more. Purely a Ritual-screen state — the saved session records the sets
   *  that happened, and "closed" says nothing the set list doesn't. */
  closed: boolean;
};

type Step =
  | "loading"
  | "restore_prompt" // found a draft from earlier today — offer to resume
  | "cardio_choice"
  | "cardio"
  | "sanguinary_cardio" // preset-baked cardio day (Sanguinary Split)
  | "standalone_cardio" // user-chosen cardio day; does not move the rotation
  | "sleep"
  | "logging"
  | "cleanse" // post-workout sauna / steam room
  | "cleanse_quote" // quote shown after the cleanse is taken or skipped
  | "weigh" // final page: bodyweight + save
  | "saving"
  | "achievements" // post-save celebration — only shown if any cards fired
  | "done";

// Names the back control uses for the step it will return to. Only steps a
// user can actually go BACK to need an entry — "saving", "achievements" and
// "done" clear the history, so they're never a back target.
const STEP_LABELS: Record<Step, string> = {
  loading: "The Altar",
  restore_prompt: "The Altar",
  cardio_choice: "The Choice",
  cardio: "The Cardio Rite",
  sanguinary_cardio: "The Cardio Day",
  standalone_cardio: "The Lungs Alone",
  sleep: "The Sleep Rite",
  logging: "The Exercises",
  cleanse: "The Cleansing",
  cleanse_quote: "The Emperor's Word",
  weigh: "The Weighing",
  saving: "The Altar",
  achievements: "The Altar",
  done: "The Altar",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RitualApp({
  adapter,
  today,
  displayUnit,
  rotationOrder,
  incrementsKg,
  mode = "auto",
  onComplete,
  onExit,
}: RitualAppProps) {
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);

  // Breadcrumb of steps the user walked forward through, so the back control
  // can retrace the exact route. A fixed per-step "previous" table would get
  // this wrong — `sleep` is reachable both directly and via `cardio_choice`,
  // and the honest answer depends on which happened.
  const [stepHistory, setStepHistory] = useState<Step[]>([]);

  // Loaded from the vault on mount.
  const [rotationPosition, setRotationPosition] = useState<number>(0);
  const [allExercises, setAllExercises] = useState<ExerciseFile[]>([]);
  const [sessions, setSessions] = useState<SessionFile[]>([]);

  // Quote pools loaded from the vault. Pro-emperor quotes are used as
  // reward text when the user confirms cardio; disavowal quotes sting the
  // user who skipped it. Loaded alongside sessions/exercises on mount.
  const [proEmperorQuotes, setProEmperorQuotes] = useState<string[]>([]);
  const [disavowalQuotes, setDisavowalQuotes] = useState<string[]>([]);
  // Companion-retinue quotes keyed by achievement kind. Loaded once on
  // mount; the achievement detector reads from this pool at save time so a
  // Ritual that's been open for an hour still gets the same characters.
  const [companionQuotes, setCompanionQuotes] = useState<CompanionQuotes>({
    workout_complete: [],
    ten_sets_muscle: [],
    fifteen_sets_muscle: [],
    five_cardio_month: [],
    rare_companion: [],
    three_session_week: [],
    five_session_week: [],
  });
  // Achievements unlocked by the just-saved session. Populated in submitWeigh
  // right before the step flips to "achievements". Empty array = skip straight
  // to "done".
  const [unlockedAchievements, setUnlockedAchievements] = useState<
    Achievement[]
  >([]);

  // User input.
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [bodyweightKg, setBodyweightKg] = useState<number | null>(null);
  const [cardioMinutes, setCardioMinutes] = useState<number | null>(null);
  const [cardioType, setCardioType] = useState<CardioType | null>(null);
  // The quote chosen for the cardio_quote step — picked at the moment the
  // user confirms/skips cardio so refreshing the step doesn't re-roll it.
  const [cardioQuote, setCardioQuote] = useState<string>("");
  // Sauna / steam taken after the lifting, or null if skipped.
  const [cleanseType, setCleanseType] = useState<CleanseType | null>(null);
  const [workingExercises, setWorkingExercises] = useState<WorkingExercise[]>([]);
  const [cardioNotes, setCardioNotes] = useState("");

  // Pending draft from an earlier run of the Ritual today. Held in state
  // while the user sees the restore prompt. If they resume, we hydrate
  // the rest of the form from this and clear it; if they abandon, we
  // clear the stored copy and null this out.
  const [pendingDraft, setPendingDraft] = useState<RitualDraft | null>(null);
  /** True when today falls inside an active deload week. Changes what the
   *  cardio-choice screen says and where accepting it leads: a deload day
   *  logs a march via "The Lungs Alone", not another cardio-week marker. */
  const [inDeload, setInDeload] = useState(false);

  // -------------------------------------------------------------------------
  // Mount: figure out which slot we're on, whether cardio is due, and what
  // exercises are available.
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedSessions, exercises, loas, proQuotes, disQuotes, companion] =
          await Promise.all([
            loadAllSessions(adapter),
            loadAllExercises(adapter),
            loadAllLoAs(adapter),
            loadQuotes(adapter, "pro_emperor"),
            loadQuotes(adapter, "disavowal"),
            loadCompanionQuotes(adapter),
          ]);
        if (cancelled) return;
        setSessions(loadedSessions);
        setAllExercises(exercises);
        setProEmperorQuotes(proQuotes);
        setDisavowalQuotes(disQuotes);
        setCompanionQuotes(companion);
        const pos = nextRotationPosition(loadedSessions, rotationOrder.length);
        setRotationPosition(pos);

        // Explicit cardio-only launch from the Altar. The user asked for
        // one specific thing, so nothing else gets a say: no draft prompt
        // (a half-logged lift session is untouched on disk and will still
        // be offered the next time they open the Ritual normally), no
        // cardio-week check, no rotation slot.
        if (mode === "cardio_only") {
          setStep("standalone_cardio");
          return;
        }

        // Draft recovery check. If an in-progress draft for TODAY is
        // sitting in localStorage, we don't pick an initial step
        // ourselves — we show a restore prompt and let the user decide.
        // Same-date TTL is enforced inside loadRitualDraft, so a stale
        // draft from yesterday never reaches us here.
        const draft = loadRitualDraft(today);
        if (draft) {
          setPendingDraft(draft);
          setStep("restore_prompt");
          return;
        }

        // No draft — pick the initial step by normal rules.
        //   1. If the user is due for a cardio week, ask up front.
        //   2. Otherwise, if today's rotation slot is a preset-baked
        //      cardio day (Sanguinary Split), go straight into the
        //      cardio flow — it's not a deload but the rotation still
        //      demands cardio today, so skipping the sleep prompt would
        //      drop us into the strength menu with no exercises.
        //   3. Otherwise, normal: sleep → logging.
        const tlSessions = sessionsForTimeLogic(loadedSessions);
        const dueForCardio = isCardioWeekDue(
          tlSessions,
          loasForTimeLogic(loas),
          today,
        );
        // Already INSIDE a deload week, as opposed to merely due for one.
        // isCardioWeekDue goes false the moment a deload starts (the counter
        // resets), so on its own it would drop a deload day straight into
        // the lifting menu with no way to reach cardio at all.
        const insideCardioWeek = isInLeaveOfAbsence(
          today,
          deriveCardioWeekRanges(tlSessions),
        );
        setInDeload(insideCardioWeek);
        if (dueForCardio || insideCardioWeek) {
          setStep("cardio_choice");
        } else {
          const slotHere =
            rotationOrder.length > 0
              ? rotationOrder[pos % rotationOrder.length]
              : ROTATION_SLOTS[pos % ROTATION_SLOTS.length];
          setStep(slotHere === "cardio" ? "sanguinary_cardio" : "sleep");
        }
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adapter, today, mode]);

  // Use the user-configured rotation order; fall back to compile-time
  // defaults if an empty array somehow slipped through.
  const activeOrder: RotationOrderSlot[] =
    rotationOrder.length > 0 ? rotationOrder : [...ROTATION_SLOTS];
  const slot: RotationOrderSlot =
    activeOrder[rotationPosition % activeOrder.length];

  // Exercises available for the current slot — used for the picker menu.
  // Cardio slots don't carry a lift menu (the user is on the sanguinary
  // cardio step instead); narrow to RotationSlot before filtering so the
  // compile-time types of ExerciseFile.rotationSlots still check out.
  const menuExercises = useMemo(() => {
    if (slot === "cardio") return [];
    const strengthSlot: RotationSlot = slot;
    return allExercises.filter((e) => e.rotationSlots.includes(strengthSlot));
  }, [allExercises, slot]);

  // -------------------------------------------------------------------------
  // Draft recovery: resume / abandon handlers
  // -------------------------------------------------------------------------

  // Apply the pending draft's state to the live form and drop the user
  // back onto whatever step they left. The draft's step is a string
  // (we widened to avoid importing the Step union into the draft
  // module); we narrow it by intersecting with the known steps and
  // fall back to "logging" if something impossible comes through.
  const resumeDraft = () => {
    if (!pendingDraft) return;
    setSleepHours(pendingDraft.sleepHours);
    setBodyweightKg(pendingDraft.bodyweightKg);
    setCardioMinutes(pendingDraft.cardioMinutes);
    setCardioType(pendingDraft.cardioType);
    setCardioQuote(pendingDraft.cardioQuote);
    setCleanseType(pendingDraft.cleanseType);
    setCardioNotes(pendingDraft.cardioNotes);
    setWorkingExercises(
      pendingDraft.workingExercises.map((w) => ({ ...w, closed: w.closed })),
    );

    const resumableSteps = new Set<Step>([
      "cardio",
      "sanguinary_cardio",
      "sleep",
      "logging",
      "cleanse",
      "cleanse_quote",
      "weigh",
    ]);
    const candidate = pendingDraft.step as Step;
    // A restored draft has no forward route behind it — the user didn't
    // walk here this session. Back from a restored step leaves the Ritual.
    setStepHistory([]);
    setStep(resumableSteps.has(candidate) ? candidate : "logging");
    setPendingDraft(null);
  };

  // Throw away the draft and start a fresh Ritual. We also purge the
  // persisted copy so it doesn't re-offer itself on next mount.
  const abandonDraft = () => {
    clearRitualDraft();
    setPendingDraft(null);
    setStepHistory([]);
    // Decide initial step the same way as mount. We don't need
    // dueForCardio here — the user already chose to start fresh, so
    // skipping the cardio_choice nudge is fine; it'll re-surface
    // tomorrow if the counter still says so.
    setStep(slot === "cardio" ? "sanguinary_cardio" : "sleep");
  };

  // -------------------------------------------------------------------------
  // Autosave: persist the draft on every meaningful state change.
  //
  // The set of dependencies captures the state the user has actually
  // invested time in — sleep, bodyweight, logged sets, the step
  // they're on. We deliberately don't save while the initial load is
  // still running ("loading") or after the save has committed
  // ("saving", "done", "achievements") — those transient states would
  // either write noise or, worse, stamp a draft moments before we
  // clear it in submitWeigh.
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (
      step === "loading" ||
      step === "restore_prompt" ||
      step === "saving" ||
      step === "done" ||
      step === "achievements"
    ) {
      return;
    }
    saveRitualDraft({
      date: today,
      version: 2,
      step,
      sleepHours,
      bodyweightKg,
      cardioMinutes,
      cardioType,
      cardioQuote,
      cleanseType,
      cardioNotes,
      workingExercises,
    });
  }, [
    today,
    step,
    sleepHours,
    bodyweightKg,
    cardioMinutes,
    cardioType,
    cardioQuote,
    cardioNotes,
    workingExercises,
  ]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Step navigation
  // -------------------------------------------------------------------------

  /**
   * Move forward one step, remembering where we came from.
   *
   * Every user-driven forward transition goes through here. Transitions that
   * must NOT be re-entered — "saving", "achievements", "done", and the
   * initial step chosen on mount — call setStep directly and clear the
   * history, because there is no sane meaning to "back" once the session is
   * on disk.
   */
  const goTo = (next: Step) => {
    setStepHistory((prev) => [...prev, step]);
    setStep(next);
  };

  /**
   * Retrace one step. At the first step of the flow there's nothing to
   * retrace, so this leaves the Ritual entirely.
   *
   * Going back is always non-destructive: sleep hours, picked exercises,
   * logged sets and cardio minutes all live in component state, so walking
   * back to the logging screen and forward again finds everything where it
   * was. The autosave effect keeps writing the draft throughout.
   */
  const goBack = () => {
    if (stepHistory.length === 0) {
      onExit();
      return;
    }
    setStep(stepHistory[stepHistory.length - 1]);
    setStepHistory(stepHistory.slice(0, -1));
  };

  /** Human name of wherever `goBack` will land, for the control's label. */
  const backLabel =
    stepHistory.length === 0
      ? "The Altar"
      : STEP_LABELS[stepHistory[stepHistory.length - 1]];

  const submitSleep = (hours: number | null) => {
    setSleepHours(hours);
    goTo("logging");
  };

  // -------------------------------------------------------------------------
  // Switching to a different workout
  // -------------------------------------------------------------------------

  /**
   * Train a different day than the rotation decreed — the leg machines are
   * all taken, or the user simply wants push today.
   *
   * Implemented by moving `rotationPosition` to the chosen slot's index
   * rather than by carrying a separate override flag. That single assignment
   * gets three things right at once: the menu re-filters to the new slot,
   * the saved session records the day actually trained, and the rotation
   * resumes from there next time (nextRotationPosition is just "last saved
   * position + 1"). Skipping legs today means legs comes back around rather
   * than being silently lost.
   *
   * Picked exercises are dropped — they belong to the day being left, and
   * carrying them into a different slot would file bench press under a leg
   * session. The caller confirms first if any sets are already logged.
   */
  const switchWorkout = (index: number) => {
    setRotationPosition(index);
    setWorkingExercises([]);
    const target = activeOrder[index % activeOrder.length];
    // A preset with a baked-in cardio day (Sanguinary) has no lift menu for
    // that slot — route into its cardio flow instead of an empty picker.
    if (target === "cardio") goTo("sanguinary_cardio");
  };

  // Pick a random quote from a pool, with a graceful fallback in case
  // quotes haven't been seeded yet. Kept inline rather than as a helper so
  // the no-quotes branch is visible where it matters.
  const pickQuote = (pool: string[], fallback: string) => {
    if (pool.length === 0) return fallback;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // User either took a sauna/steam or skipped it. Cleansing earns a
  // pro-emperor quote; skipping earns a disavowal — same reward shape the
  // cardio finisher used, since the beat works and the quote pools are
  // already written for it.
  const submitCleanse = (type: CleanseType | null) => {
    setCleanseType(type);
    setCardioQuote(
      type !== null
        ? pickQuote(proEmperorQuotes, "In nomine Imperatoris.")
        : pickQuote(disavowalQuotes, "The Emperor turns His gaze from you."),
    );
    goTo("cleanse_quote");
  };

  const addExercise = (ex: ExerciseFile) => {
    // Don't add the same exercise twice — tap a second time would be confusing.
    if (workingExercises.some((w) => w.exerciseId === ex.id)) return;
    setWorkingExercises((prev) => [
      ...prev,
      {
        exerciseId: ex.id,
        displayName: ex.displayName,
        bodyweight: ex.bodyweight,
        sets: [],
        closed: false,
      },
    ]);
  };

  // Close / reopen a lift. Closing is reversible on purpose: the common
  // reason to reopen is realising you had one more set in you.
  const toggleClosed = (exerciseId: string) => {
    setWorkingExercises((prev) =>
      prev.map((w) =>
        w.exerciseId === exerciseId ? { ...w, closed: !w.closed } : w,
      ),
    );
  };

  const addSet = (exerciseId: string, set: SetEntry) => {
    setWorkingExercises((prev) =>
      prev.map((w) =>
        w.exerciseId === exerciseId ? { ...w, sets: [...w.sets, set] } : w,
      ),
    );
  };

  const deleteSet = (exerciseId: string, index: number) => {
    setWorkingExercises((prev) =>
      prev.map((w) =>
        w.exerciseId === exerciseId
          ? { ...w, sets: w.sets.filter((_, i) => i !== index) }
          : w,
      ),
    );
  };

  // "End the Ritual" no longer saves — it advances to the cardio finisher.
  // The actual save happens at the very end, on "Exit the Exercitium".
  const endRitual = () => {
    goTo("cleanse");
  };

  /**
   * Commit a session and route to whatever comes after.
   *
   * Shared by every flow that produces a real training session — the
   * strength rite, the Sanguinary cardio day, and the standalone cardio
   * session. All three run achievement detection, which is what makes a
   * cardio-only day count toward the weekly 3- and 5-session conditions:
   * the detector counts session DATES in the rolling window and doesn't
   * care whether the day involved iron.
   *
   * Cardio Week deliberately does NOT come through here — it's a deload,
   * and handing out "THE WEEK IS KEPT" for a rest week would be a lie.
   *
   * `failureStep` is where the user lands if the write throws, so they can
   * retry from the screen they were on rather than a dead end.
   */
  const commitSession = async (session: SessionFile, failureStep: Step) => {
    // Past the point of no return — drop the breadcrumb so a stray back
    // tap on the achievements screen can't walk into a re-save.
    setStepHistory([]);
    setStep("saving");
    try {
      await saveSession(adapter, session);
      // The rite is committed to disk — the draft has served its purpose.
      clearRitualDraft();
      // Detect BEFORE flipping to "done" so the celebration screen can
      // intercept. The detector sees `sessions` (the state loaded on mount)
      // as the PRIOR list — correct, because the just-saved session is
      // passed separately as `sessionBeingSaved`.
      const unlocked = detectAchievements({
        sessionBeingSaved: session,
        exercises: allExercises,
        priorSessions: sessions,
        today,
        quotes: companionQuotes,
      });
      if (unlocked.length > 0) {
        setUnlockedAchievements(unlocked);
        setStep("achievements");
      } else {
        setStep("done");
        // Small delay so the user sees the "done" message before the view closes.
        setTimeout(onComplete, 800);
      }
    } catch (e) {
      setError(`Failed to save session: ${String(e)}`);
      setStep(failureStep);
    }
  };

  // Final save, triggered by the Weigh step's "Exit the Exercitium" button.
  // Bodyweight is captured here (at end of workout) rather than at the start.
  const submitWeigh = async (weightKg: number | null) => {
    setBodyweightKg(weightKg);
    await commitSession(
      {
        date: today,
        rotationPosition,
        rotationSlot: slot,
        isCardioWeek: false,
        sleepHours,
        bodyweightKg: weightKg,
        // Cardio no longer rides along on a strength session — it's logged
        // as its own day via "The Lungs Alone".
        cardioMinutes: null,
        cardioType: null,
        cleanseType,
        exercises: workingExercises.map((w) => ({
          name: w.exerciseId,
          sets: w.sets,
        })),
        notes: "",
      },
      "weigh",
    );
  };

  /**
   * Save a standalone cardio session — the Altar's "The Lungs Alone".
   *
   * Three fields carry the whole meaning, and each is deliberate:
   *   rotationPosition: null  — nextRotationPosition ignores sessions with a
   *                             null position, so the lift day that was next
   *                             is still next. Cardio doesn't cost you legs.
   *   isCardioWeek: false     — a Cardio Week is a six-weekly DELOAD. Flagging
   *                             this true would reset the deload counter and
   *                             put the Altar into "the rotation sleeps",
   *                             neither of which the user asked for.
   *   rotationSlot: "cardio"  — what actually happened, for anyone reading
   *                             the file.
   *
   * That combination (cardio slot + not a cardio week + no position) is
   * unique to this flow, so it stays distinguishable from both the deload
   * and the Sanguinary scheduled day without a new schema field.
   *
   * It still counts as a session for the weekly 3/5 conditions — see
   * commitSession.
   */
  const endStandaloneCardio = async (minutes: number, type: CardioType) => {
    await commitSession(
      {
        date: today,
        rotationPosition: null,
        rotationSlot: "cardio",
        isCardioWeek: false,
        sleepHours,
        bodyweightKg,
        cardioMinutes: minutes,
        cardioType: type,
        // No lifting happened, so there is nothing to cleanse after.
        cleanseType: null,
        exercises: [],
        notes: "Cardio alone — the rotation held its place.",
      },
      "standalone_cardio",
    );
  };

  // End the Sanguinary Split's scheduled cardio day. Unlike Cardio Week,
  // this DOES advance the rotation — the cardio slot is part of the
  // rotation, not a week-long deload — so we write rotationPosition
  // alongside the "cardio" slot marker and isCardioWeek stays false.
  //
  // Routed through commitSession so it earns achievement cards like any
  // other training day. It didn't before, which meant a Sanguinary user's
  // cardio day silently failed to award the weekly conditions it had in
  // fact just satisfied.
  const endSanguinaryCardio = async (minutes: number, type: CardioType) => {
    await commitSession(
      {
        date: today,
        rotationPosition,
        rotationSlot: "cardio",
        isCardioWeek: false,
        sleepHours,
        bodyweightKg,
        cardioMinutes: minutes,
        cardioType: type,
        cleanseType: null,
        exercises: [],
        notes: cardioNotes,
      },
      "sanguinary_cardio",
    );
  };

  const endCardio = async () => {
    setStepHistory([]);
    setStep("saving");
    const session: SessionFile = {
      date: today,
      // Cardio week doesn't advance the rotation, so we write null and the
      // "cardio" slot marker so a human reading the file sees what it was.
      rotationPosition: null,
      rotationSlot: "cardio",
      isCardioWeek: true,
      sleepHours,
      bodyweightKg,
      cardioMinutes: null,
      cardioType: null,
      cleanseType: null,
      exercises: [],
      notes: cardioNotes,
    };
    try {
      await saveSession(adapter, session);
      clearRitualDraft();
      setStep("done");
      setTimeout(onComplete, 800);
    } catch (e) {
      setError(`Failed to save session: ${String(e)}`);
      setStep("cardio");
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Any set logged this session. Drives both the "your work is safe" hint on
  // the back control and the confirmation gate on switching workouts.
  const hasLoggedWork = workingExercises.some((w) => w.sets.length > 0);

  // Leaving the Ritual with sets on the board looks destructive even though
  // the draft autosaves. Say so, but only when it's actually the situation —
  // a hint on every step is just noise.
  const backHint =
    stepHistory.length === 0 && hasLoggedWork
      ? "Your logged sets are kept"
      : undefined;

  // Every mid-flow step gets the same back control above its own card.
  // Wrapping at the call site keeps the step components ignorant of
  // navigation — they stay pure "ask one question" units.
  const withBack = (node: ReactElement) => (
    <>
      <StepBackBar label={backLabel} hint={backHint} onBack={goBack} />
      {node}
    </>
  );

  if (error) {
    return (
      <div className="exercitium-ritual">
        <StepBackBar label={backLabel} onBack={goBack} />
        <h2>The altar rejects your offering.</h2>
        <pre className="exercitium-error">{error}</pre>
      </div>
    );
  }

  if (step === "loading") {
    return (
      <div className="exercitium-ritual">
        <p className="exercitium-subtitle">Consulting the archives…</p>
      </div>
    );
  }

  if (step === "restore_prompt" && pendingDraft) {
    return (
      <RestoreDraftStep
        draft={pendingDraft}
        onResume={resumeDraft}
        onAbandon={abandonDraft}
      />
    );
  }

  if (step === "cardio_choice") {
    return withBack(
      <CardioChoiceStep
        inDeload={inDeload}
        // Already in a deload: the week is flagged, so what is wanted now is
        // the march itself — modality and minutes — not a second cardio-week
        // marker. Route to the standalone flow. Only the "a deload is due"
        // case declares a new Cardio Week.
        onCardio={() => goTo(inDeload ? "standalone_cardio" : "cardio")}
        onDefer={() =>
          // If the rotation itself has landed on its cardio day (Sanguinary
          // Split), "Lift anyway" still can't lift — there are no
          // exercises assigned to the cardio slot. Route into the preset's
          // scheduled cardio flow instead of a dead-empty logging menu.
          goTo(slot === "cardio" ? "sanguinary_cardio" : "sleep")
        }
      />,
    );
  }

  if (step === "cardio") {
    return withBack(
      <CardioStep
        sleepHours={sleepHours}
        setSleepHours={setSleepHours}
        notes={cardioNotes}
        setNotes={setCardioNotes}
        onEnd={endCardio}
        saving={false}
      />,
    );
  }

  if (step === "sanguinary_cardio") {
    return withBack(
      <CardioSessionStep
        sessionCount={sessions.length}
        variant="sanguinary"
        onSubmit={(m, t) => {
          // Only "Confirm" reaches here with non-null values; the Step
          // component never lets the user "skip" the scheduled cardio day.
          if (m !== null && t !== null) {
            void endSanguinaryCardio(m, t);
          }
        }}
      />,
    );
  }

  if (step === "standalone_cardio") {
    return withBack(
      <CardioSessionStep
        sessionCount={sessions.length}
        variant="standalone"
        onSubmit={(m, t) => {
          if (m !== null && t !== null) {
            void endStandaloneCardio(m, t);
          }
        }}
      />,
    );
  }

  if (step === "sleep") {
    return withBack(<SleepStep onSubmit={submitSleep} />);
  }

  if (step === "cleanse") {
    return withBack(<CleanseStep onSubmit={submitCleanse} />);
  }

  if (step === "cleanse_quote") {
    return withBack(
      <CardioQuoteStep
        quote={cardioQuote}
        skipped={cleanseType === null}
        onContinue={() => goTo("weigh")}
      />,
    );
  }

  if (step === "weigh") {
    return withBack(
      <WeighStep
        lastBodyweightKg={lastRecordedBodyweight(sessions, today)}
        displayUnit={displayUnit}
        onSubmit={submitWeigh}
        saving={false}
      />,
    );
  }

  if (step === "saving") {
    return (
      <div className="exercitium-ritual">
        <p className="exercitium-subtitle">Inscribing the rite…</p>
      </div>
    );
  }

  if (step === "achievements") {
    return (
      <AchievementsScreen
        achievements={unlockedAchievements}
        onContinue={() => {
          setStep("done");
          setTimeout(onComplete, 600);
        }}
      />
    );
  }

  if (step === "done") {
    return (
      <div className="exercitium-ritual">
        <h2>The rite is complete.</h2>
        <p className="exercitium-subtitle">In nomine Imperatoris.</p>
      </div>
    );
  }

  // step === "logging"
  return (
    <div className="exercitium-ritual">
      <StepBackBar label={backLabel} hint={backHint} onBack={goBack} />
      <SlotBanner slot={slot} position={rotationPosition} />
      <ExerciseMenu
        exercises={menuExercises}
        library={allExercises}
        onPick={addExercise}
        picked={new Set(workingExercises.map((w) => w.exerciseId))}
      />
      {workingExercises.map((w) => (
        <SetLogger
          key={w.exerciseId}
          exercise={w}
          displayUnit={displayUnit}
          // Looked up rather than carried on WorkingExercise so the
          // autosaved draft shape stays unchanged — a draft restored from
          // before this field existed still picks up the current target.
          targetSets={
            allExercises.find((e) => e.id === w.exerciseId)?.targetSets ??
            DEFAULT_TARGET_SETS
          }
          suggestion={suggestNext(w.exerciseId, sessions, {
            // Look up this exercise's equipment so we pick the right
            // per-equipment increment from Settings. Bodyweight exercises
            // ignore increment (suggestNext adds reps instead of weight),
            // so the exact number we pass in that branch doesn't matter.
            incrementKg:
              incrementsKg[
                allExercises.find((e) => e.id === w.exerciseId)?.equipment ??
                  "barbell"
              ],
          })}
          historicalBestEpley={bestEpleyForExercise(sessions, w.exerciseId)}
          onAddSet={(set) => addSet(w.exerciseId, set)}
          onDeleteSet={(i) => deleteSet(w.exerciseId, i)}
          onToggleClosed={() => toggleClosed(w.exerciseId)}
        />
      ))}
      <button
        className="exercitium-end-btn"
        disabled={workingExercises.length === 0}
        onClick={endRitual}
      >
        End the Ritual
      </button>

      {/* Escape hatch for the day the squat rack is occupied. Sits below
          "End the Ritual" on purpose — it's the rarer action, and putting it
          above would make the primary button harder to reach on a phone. */}
      <WorkoutSwitcher
        activeOrder={activeOrder}
        currentIndex={rotationPosition % activeOrder.length}
        hasLoggedWork={hasLoggedWork}
        onSwitch={switchWorkout}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers: adapt storage types → the narrower shape timeLogic wants.
// SessionFile has extra fields (rotationSlot, exercises, etc.) that timeLogic
// doesn't need. We project to the minimal Session shape for that module.
// ---------------------------------------------------------------------------

function sessionsForTimeLogic(sessions: SessionFile[]): Session[] {
  return sessions.map((s) => ({
    date: s.date,
    isCardioWeek: s.isCardioWeek,
    rotationPosition: s.rotationPosition,
  }));
}

function loasForTimeLogic(loas: LoAFile[]): LoA[] {
  return loas.map((l) => ({ start: l.start, end: l.end }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Restore prompt — the first screen the user sees when a same-date
// draft was found. Shows a short summary (how many exercises, how many
// sets) so resuming vs. abandoning is an informed choice, not a coin
// flip. No auto-resume: if the user was mid-way through a workout and
// their device died, dropping them straight back into a set form
// without asking would feel like a reset they didn't order.
function RestoreDraftStep({
  draft,
  onResume,
  onAbandon,
}: {
  draft: RitualDraft;
  onResume: () => void;
  onAbandon: () => void;
}) {
  const exerciseCount = draft.workingExercises.length;
  const setCount = draft.workingExercises.reduce(
    (a, w) => a + w.sets.length,
    0,
  );
  return (
    <div className="exercitium-ritual">
      <h2>The rite was interrupted.</h2>
      <p className="exercitium-subtitle">
        A partial offering from earlier today remains on the altar —{" "}
        {exerciseCount}{" "}
        {exerciseCount === 1 ? "exercise" : "exercises"}, {setCount}{" "}
        {setCount === 1 ? "set" : "sets"} logged. Resume the rite, or begin
        anew.
      </p>
      <div className="exercitium-row">
        <button className="exercitium-btn" onClick={onResume}>
          Resume the rite
        </button>
        <button
          className="exercitium-btn exercitium-btn-secondary"
          onClick={onAbandon}
        >
          Begin anew
        </button>
      </div>
    </div>
  );
}

function CardioChoiceStep({
  inDeload,
  onCardio,
  onDefer,
}: {
  /** Inside a deload already, rather than being offered one. */
  inDeload: boolean;
  onCardio: () => void;
  onDefer: () => void;
}) {
  return (
    <div className="exercitium-ritual">
      <h2>The flesh demands respite.</h2>
      <p className="exercitium-subtitle">
        {inDeload
          ? "The deload is already decreed. Give the lungs their due, or take up the iron regardless."
          : "Six weeks have passed since the last deload. The Imperium counsels a Cardio Week."}
      </p>
      <div className="exercitium-row">
        <button className="exercitium-btn" onClick={onCardio}>
          {inDeload ? "The Lungs Alone" : "Observe the deload"}
        </button>
        <button
          className="exercitium-btn exercitium-btn-secondary"
          onClick={onDefer}
        >
          Lift anyway
        </button>
      </div>
    </div>
  );
}

function CardioStep({
  sleepHours,
  setSleepHours,
  notes,
  setNotes,
  onEnd,
  saving,
}: {
  sleepHours: number | null;
  setSleepHours: (h: number | null) => void;
  notes: string;
  setNotes: (n: string) => void;
  onEnd: () => void;
  saving: boolean;
}) {
  const [sleepInput, setSleepInput] = useState(
    sleepHours === null ? "" : String(sleepHours),
  );
  return (
    <div className="exercitium-ritual">
      <h2>Cardio Week</h2>
      <p className="exercitium-subtitle">
        Let the body recover. Note what you did — running, walking, cycling,
        rowing. The rotation does not advance.
      </p>
      <div className="exercitium-row">
        <label>
          Sleep (hours):{" "}
          <input
            type="number"
            min={0}
            max={24}
            step={0.25}
            value={sleepInput}
            onChange={(e) => {
              setSleepInput(e.target.value);
              const n = parseFloat(e.target.value);
              setSleepHours(Number.isFinite(n) ? n : null);
            }}
            className="exercitium-input exercitium-input-narrow"
          />
        </label>
      </div>
      <textarea
        className="exercitium-input"
        style={{ width: "100%", minHeight: "6rem", marginTop: "0.75rem" }}
        placeholder="Notes: what did you do? How did it feel?"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button
        className="exercitium-end-btn"
        disabled={saving}
        onClick={onEnd}
      >
        {saving ? "Inscribing…" : "End the Ritual"}
      </button>
    </div>
  );
}

function SleepStep({
  onSubmit,
}: {
  onSubmit: (hours: number | null) => void;
}) {
  const [sleep, setSleep] = useState("");

  const handleSubmit = (skipped: boolean) => {
    const h = parseFloat(sleep);
    // "Keep Heretical Secret" means no sleep value for today.
    const hoursOut = skipped ? null : Number.isFinite(h) ? h : null;
    onSubmit(hoursOut);
  };

  return (
    <div className="exercitium-ritual">
      <h2>Hours in Hibernation Chamber</h2>
      <p className="exercitium-subtitle">Solar Hours</p>
      <input
        type="number"
        min={0}
        max={24}
        step={0.25}
        value={sleep}
        onChange={(e) => setSleep(e.target.value)}
        className="exercitium-input"
        autoFocus
      />
      <div className="exercitium-row">
        <button className="exercitium-btn" onClick={() => handleSubmit(false)}>
          Enter The Exercitium
        </button>
        <button
          className="exercitium-btn exercitium-btn-secondary"
          onClick={() => handleSubmit(true)}
        >
          Keep Heretical Secret
        </button>
      </div>
    </div>
  );
}

// "Cleanse the Flesh" — the post-workout sauna or steam room.
//
// Replaced the cardio finisher, which asked for minutes of cardio at the end
// of every session and went unused. Cardio is now its own session type, so
// bolting it onto the end of a lift was asking the wrong question.
//
// Records WHICH, not how long. The Altar tallies how often the flesh was
// cleansed; a duration field would be one more thing to type while sitting
// in a hot room with a phone you would rather not be holding.
//
// Skipping is a first-class option and earns a disavowal quote, same as the
// old finisher — the point is a nudge, not a wall.
function CleanseStep({
  onSubmit,
}: {
  onSubmit: (type: CleanseType | null) => void;
}) {
  return (
    <div className="exercitium-ritual">
      <h2>Cleanse the Flesh</h2>
      <p className="exercitium-subtitle">
        The iron is done with you. Heat purges what remains.
      </p>

      <div className="exercitium-cardio-picker">
        {CLEANSE_TYPE_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            className="exercitium-cardio-pick-item"
            onClick={() => onSubmit(t)}
          >
            {CLEANSE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="exercitium-row">
        <button
          className="exercitium-btn exercitium-btn-secondary"
          onClick={() => onSubmit(null)}
        >
          Leave unclean
        </button>
      </div>
    </div>
  );
}

const CLEANSE_TYPE_ORDER: CleanseType[] = ["sauna", "steam"];

const CLEANSE_LABELS: Record<CleanseType, string> = {
  sauna: "Sauna",
  steam: "Steam Room",
};

// A lift-free cardio session. Two callers, two framings:
//
//   "sanguinary" — the Sanguinary Split's SCHEDULED cardio day. The rotation
//                  landed here, and saving advances past it.
//   "standalone" — the user chose cardio from the Altar. Nothing scheduled
//                  it, and it deliberately does NOT touch the rotation:
//                  whatever lift day was next is still next.
//
// Unlike the post-strength cardio finisher, this IS the session — there
// are no lifts, so there's no "Leave in shame" option. Skipping would save
// nothing, which for the scheduled variant would leave the rotation stuck.
//
// Recommendation mirrors the finisher logic: every 4th session is a
// Force March (Zone 4, 10 min); the rest are Patrol March (Zone 2,
// 30 min). The Sanguinary Split naturally lands on this screen every
// fourth rotation position, which overlaps the "every 4th session"
// pattern roughly enough that Malte usually sees Patrol March here.
function CardioSessionStep({
  sessionCount,
  variant,
  onSubmit,
}: {
  sessionCount: number;
  variant: "sanguinary" | "standalone";
  onSubmit: (minutes: number | null, type: CardioType | null) => void;
}) {
  // Every 4th cardio session is a hard sprint; the rest are steady marches.
  // Deterministic on the session count so a run of sprints can't happen by
  // chance, and the picker opens pre-set to whichever is due.
  const isSprint = sessionCount % 4 === 3;
  const recommendedMinutes = isSprint ? 10 : 30;
  const marchName = isSprint ? "Sprint" : "Patrol March";
  const zoneLabel = isSprint ? "Zone 4" : "Zone 2";

  const [selectedType, setSelectedType] = useState<CardioType>(
    isSprint ? "sprint" : "march",
  );
  const [minutesInput, setMinutesInput] = useState(String(recommendedMinutes));

  const handleConfirm = () => {
    const m = parseFloat(minutesInput);
    if (!Number.isFinite(m) || m <= 0) return;
    onSubmit(m, selectedType);
  };

  const standalone = variant === "standalone";

  return (
    <div className="exercitium-ritual">
      <h2>{standalone ? "The Lungs Alone" : "The Sanguinary Cardio Day"}</h2>
      <p className="exercitium-subtitle">
        {standalone ? (
          <>
            No iron today — only the march. The rotation keeps its place; the
            day it decreed will be waiting. The Imperium suggests:{" "}
            {recommendedMinutes} minutes of {marchName} ({zoneLabel}).
          </>
        ) : (
          <>
            Today, the rotation demands the lungs. No lifts — only the march.
            The Imperium decrees: {recommendedMinutes} minutes of {marchName} (
            {zoneLabel}).
          </>
        )}
      </p>

      <div className="exercitium-cardio-picker">
        {CARDIO_TYPE_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            className={
              "exercitium-cardio-pick-item" +
              (selectedType === t
                ? " exercitium-cardio-pick-item-selected"
                : "")
            }
            onClick={() => setSelectedType(t)}
          >
            {CARDIO_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="exercitium-cardio-minutes">
        <label
          className="exercitium-cardio-minutes-label"
          htmlFor="sanguinary-cardio-minutes"
        >
          Minutes of {CARDIO_LABELS[selectedType]}
        </label>
        <input
          id="sanguinary-cardio-minutes"
          type="number"
          inputMode="numeric"
          min={0}
          max={300}
          step={1}
          value={minutesInput}
          onChange={(e) => setMinutesInput(e.target.value)}
          className="exercitium-input"
          autoFocus
        />
      </div>

      <button className="exercitium-end-btn" onClick={handleConfirm}>
        Exit the Exercitium
      </button>
    </div>
  );
}

// Display order for the modality picker. March first — it's the default and
// the more frequent of the two.
const CARDIO_TYPE_ORDER: CardioType[] = ["march", "sprint"];

const CARDIO_LABELS: Record<CardioType, string> = {
  march: "March",
  sprint: "Sprint",
};

// Shows a single quote — pro-emperor (reward) or disavowal (shame),
// chosen at the moment the user committed to/skipped the cardio step.
function CardioQuoteStep({
  quote,
  skipped,
  onContinue,
}: {
  quote: string;
  skipped: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="exercitium-ritual">
      <h2>{skipped ? "The Emperor takes note." : "The Emperor smiles."}</h2>
      <blockquote className="exercitium-altar-quote">{quote}</blockquote>
      <button className="exercitium-btn" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}

// Final page of the ritual: record bodyweight and commit the session to disk.
// Bodyweight lives at the end rather than the start because the user weighs
// themselves after the workout.
//
// Storage is kg regardless of the user's display unit — the input text is
// converted at parse time via parseInputWeight(). The min/max attributes
// widen in lb mode since 20–300 kg ≈ 44–661 lb; we keep them sensible but
// not tight, since these are sanity limits not validation rules.
function WeighStep({
  lastBodyweightKg,
  displayUnit,
  onSubmit,
  saving,
}: {
  lastBodyweightKg: number | null;
  displayUnit: DisplayUnit;
  onSubmit: (weightKg: number | null) => void;
  saving: boolean;
}) {
  // Prefill with the last recorded value in the user's display unit, so a
  // user who picked lb sees "176.4" rather than the raw "80" kg number.
  const [weight, setWeight] = useState(
    lastBodyweightKg === null
      ? ""
      : formatWeightInput(lastBodyweightKg, displayUnit),
  );

  const handleSubmit = (skipped: boolean) => {
    if (skipped) {
      onSubmit(null);
      return;
    }
    // Parse the user's input in their display unit → kg for storage.
    onSubmit(parseInputWeight(weight, displayUnit));
  };

  // Theme the subtitle to the active unit: "Kilograms" feels right in kg
  // mode, while lb mode earns a cheeky Mechanicus-flavored label so the
  // grimdark tone survives the toggle.
  const subtitle =
    displayUnit === "lb" ? "Pounds — heretical measures" : "Kilograms";

  return (
    <div className="exercitium-ritual">
      <h2>Weight of the Flesh</h2>
      <p className="exercitium-subtitle">{subtitle}</p>
      <input
        type="number"
        min={displayUnit === "lb" ? 40 : 20}
        max={displayUnit === "lb" ? 660 : 300}
        step={0.1}
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        className="exercitium-input"
        autoFocus
      />
      <div className="exercitium-row">
        <button
          className="exercitium-btn"
          disabled={saving}
          onClick={() => handleSubmit(false)}
        >
          {saving ? "Inscribing…" : "Exit the Exercitium"}
        </button>
        <button
          className="exercitium-btn exercitium-btn-secondary"
          disabled={saving}
          onClick={() => handleSubmit(true)}
        >
          Keep Heretical Secret
        </button>
      </div>
    </div>
  );
}

// PR celebration banner shown inside the SetLogger when a just-logged set
// produces a new estimated 1RM for this exercise. The banner persists
// until either another set is logged (at which point it either re-flashes
// or stays hidden) or the user taps the dismiss X.
//
// The e1RM display is always rounded to the nearest whole unit in the
// user's display unit — three significant figures would make the banner
// feel clinical; the PR moment wants the Emperor's gaze to land on one
// crisp number.
// ---------------------------------------------------------------------------
// AchievementsScreen — celebration screen shown after save when any
// achievement triggers fired. Stacks one card per achievement: title in
// display font, muscle-group / stat detail in the body, then a companion
// quote with attribution. One Continue button dismisses the screen and
// closes the Ritual. We don't paginate — seeing all the cards together is
// the reward.
// ---------------------------------------------------------------------------

function AchievementsScreen({
  achievements,
  onContinue,
}: {
  achievements: Achievement[];
  onContinue: () => void;
}) {
  return (
    <div className="exercitium-ritual exercitium-achievements">
      <h2 className="exercitium-achievements-heading">Deeds recorded.</h2>
      <p className="exercitium-subtitle">The retinue marks your labor.</p>
      <div className="exercitium-achievements-stack">
        {achievements.map((a, i) => (
          <AchievementCard key={`${a.kind}-${a.group ?? ""}-${i}`} achievement={a} />
        ))}
      </div>
      <button
        className="exercitium-btn exercitium-btn-primary"
        onClick={onContinue}
      >
        Step away from the altar
      </button>
    </div>
  );
}

// Cards that earn the loftier treatment — deeper gold border, brighter
// title, subtle glow — plus the corner tag naming why. Both are whole-week
// awards; everything else stays on the standard dark-gradient slate.
const ELEVATED_TAGS: Partial<Record<Achievement["kind"], string>> = {
  rare_companion_week: "RARE",
  five_session_week: "EXALTED",
};

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const tag = ELEVATED_TAGS[achievement.kind];
  const cls =
    "exercitium-achievement-card" +
    (tag ? " exercitium-achievement-card-rare" : "");
  return (
    <div className={cls} role="status">
      {tag && <div className="exercitium-achievement-rare-tag">{tag}</div>}
      <div className="exercitium-achievement-title">{achievement.title}</div>
      <div className="exercitium-achievement-detail">{achievement.detail}</div>
      <blockquote className="exercitium-achievement-quote">
        {achievement.quote.text}
      </blockquote>
      <div className="exercitium-achievement-attribution">
        — {achievement.quote.character}
      </div>
    </div>
  );
}

function PrBanner({
  e1rm,
  displayUnit,
  onDismiss,
}: {
  e1rm: number;
  displayUnit: DisplayUnit;
  onDismiss: () => void;
}) {
  return (
    <div className="exercitium-pr-banner" role="status">
      <div className="exercitium-pr-banner-head">
        <span className="exercitium-pr-banner-title">THE EMPEROR PROTECTS</span>
        <button
          className="exercitium-btn exercitium-btn-secondary"
          style={{ padding: "0 0.5rem" }}
          onClick={onDismiss}
          aria-label="Dismiss PR banner"
          title="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="exercitium-pr-banner-body">
        New best: ~{formatWeight(e1rm, displayUnit)} estimated 1RM.
      </div>
    </div>
  );
}

function SlotBanner({
  slot,
  position,
}: {
  slot: RotationOrderSlot;
  position: number;
}) {
  return (
    <div className="exercitium-banner">
      <span className="exercitium-banner-slot">{slot.toUpperCase()}</span>
      <span className="exercitium-banner-position">position {position}</span>
    </div>
  );
}

// Switch the day being trained, from the bottom of the exercise picker.
//
// The rotation is a plan, not a cage: the squat rack is taken, the legs are
// still wrecked from Tuesday, the gym closes in forty minutes. Rather than
// forcing the user to log a day they didn't do (or skip logging entirely,
// which silently freezes the rotation), this offers every other slot in the
// active preset.
//
// Collapsed by default. It's the rare path, and an always-open list of
// "train something else" buttons under a workout in progress invites
// mis-taps on a phone.
function WorkoutSwitcher({
  activeOrder,
  currentIndex,
  hasLoggedWork,
  onSwitch,
}: {
  activeOrder: RotationOrderSlot[];
  /** Index into activeOrder of the day currently being trained. */
  currentIndex: number;
  /** True if any set is already logged — switching discards them, so the
   *  choice gets a confirmation step instead of firing on first tap. */
  hasLoggedWork: boolean;
  onSwitch: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  // Index awaiting confirmation. Only ever set when hasLoggedWork.
  const [pending, setPending] = useState<number | null>(null);

  // Every slot except the one being trained, carrying its own index so the
  // handler doesn't have to search activeOrder for it (a preset could
  // legitimately repeat a slot).
  const alternatives = activeOrder
    .map((s, i) => ({ slot: s, index: i }))
    .filter(({ index }) => index !== currentIndex);

  if (alternatives.length === 0) return null;

  const choose = (index: number) => {
    if (hasLoggedWork) {
      setPending(index);
      return;
    }
    onSwitch(index);
    setOpen(false);
  };

  const confirm = () => {
    if (pending === null) return;
    onSwitch(pending);
    setPending(null);
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="exercitium-switcher">
        <button
          type="button"
          className="exercitium-switcher-toggle"
          onClick={() => setOpen(true)}
        >
          Train a different day
        </button>
      </div>
    );
  }

  return (
    <div className="exercitium-switcher exercitium-switcher-open">
      <div className="exercitium-switcher-title">SUBSTITUTE THE RITE</div>
      <p className="exercitium-subtitle">
        The rotation decrees {activeOrder[currentIndex].toUpperCase()}. If the
        machines are claimed, take up another — the cycle resumes from
        whichever day you actually train.
      </p>

      <div className="exercitium-switcher-options">
        {alternatives.map(({ slot: s, index }) => (
          <button
            key={index}
            type="button"
            className={
              "exercitium-switcher-option" +
              (pending === index ? " exercitium-switcher-option-pending" : "")
            }
            onClick={() => choose(index)}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {pending !== null && (
        <div className="exercitium-switcher-confirm">
          <p className="exercitium-switcher-warning">
            Sets already logged for{" "}
            {activeOrder[currentIndex].toUpperCase()} will be discarded.
          </p>
          <div className="exercitium-row">
            <button className="exercitium-btn" onClick={confirm}>
              Take up {activeOrder[pending % activeOrder.length].toUpperCase()}
            </button>
            <button
              className="exercitium-btn exercitium-btn-secondary"
              onClick={() => setPending(null)}
            >
              Keep the current rite
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="exercitium-switcher-toggle"
        onClick={() => {
          setPending(null);
          setOpen(false);
        }}
      >
        Never mind
      </button>
    </div>
  );
}

function ExerciseMenu({
  exercises,
  library,
  onPick,
  picked,
}: {
  /** The planned lifts for today's slot, in prescribed order. */
  exercises: ExerciseFile[];
  /** Every exercise defined in the vault, for the "Other exercise" picker. */
  library: ExerciseFile[];
  onPick: (ex: ExerciseFile) => void;
  picked: Set<string>;
}) {
  // "Other exercise" is collapsed by default. Opening it reveals the whole
  // library behind a search box — the plan is the default path, and anything
  // else is a deliberate detour rather than a wall of 45 buttons.
  const [otherOpen, setOtherOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Everything not already on today's menu. A lift can carry no rotation slot
  // at all (the upper/lower movements retired with the 5-day split) and is
  // only reachable here — muscle credit works the same either way, since
  // volume is read from the exercise file, not from which day it sat on.
  const plannedIds = new Set(exercises.map((e) => e.id));
  const q = query.trim().toLowerCase();
  const others = library
    .filter((e) => !plannedIds.has(e.id))
    .filter((e) => (q ? e.displayName.toLowerCase().includes(q) : true));

  return (
    <>
      {exercises.length === 0 ? (
        <p className="exercitium-subtitle">
          No exercises assigned to this slot yet. Add some to exercises/ in the
          vault, or pick one below.
        </p>
      ) : (
        <div className="exercitium-menu">
          {exercises.map((ex) => {
            const isPicked = picked.has(ex.id);
            return (
              <button
                key={ex.id}
                className={
                  "exercitium-menu-item" +
                  (isPicked ? " exercitium-menu-item-picked" : "")
                }
                disabled={isPicked}
                onClick={() => onPick(ex)}
              >
                {ex.displayName}
                {ex.bodyweight ? " · BW" : ""}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="exercitium-other-toggle"
        aria-expanded={otherOpen}
        onClick={() => setOtherOpen((v) => !v)}
      >
        {otherOpen ? "− Other exercise" : "+ Other exercise"}
      </button>

      {otherOpen && (
        <div className="exercitium-other-panel">
          <input
            type="search"
            className="exercitium-input"
            placeholder="Search all exercises…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {others.length === 0 ? (
            <p className="exercitium-subtitle">
              Nothing matches "{query}".
            </p>
          ) : (
            <div className="exercitium-menu">
              {others.map((ex) => {
                const isPicked = picked.has(ex.id);
                return (
                  <button
                    key={ex.id}
                    className={
                      "exercitium-menu-item" +
                      (isPicked ? " exercitium-menu-item-picked" : "")
                    }
                    disabled={isPicked}
                    onClick={() => onPick(ex)}
                  >
                    {ex.displayName}
                    {ex.bodyweight ? " · BW" : ""}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function SetLogger({
  exercise,
  displayUnit,
  targetSets,
  suggestion,
  historicalBestEpley,
  onAddSet,
  onDeleteSet,
  onToggleClosed,
}: {
  exercise: WorkingExercise;
  displayUnit: DisplayUnit;
  /** Sets the plan prescribes. Shown as an "n/target" counter beside the
   *  exercise name. Advisory only — nothing stops the user logging more. */
  targetSets: number;
  suggestion: {
    reps: number;
    weightKg: number;
    lastSets: SetEntry[] | null;
    lastDate: string | null;
  };
  /** Best estimated 1RM ever recorded for this exercise across history.
   *  Used as the PR-banner baseline. 0 means "no prior baseline" — we
   *  suppress the banner in that case so the very first logged set of a
   *  never-before-seen lift doesn't trigger a celebration. */
  historicalBestEpley: number;
  onAddSet: (set: SetEntry) => void;
  onDeleteSet: (index: number) => void;
  /** Flip this lift between "still going" and "done for today". */
  onToggleClosed: () => void;
}) {
  // Prefill the inputs with the suggested next reps/weight in the user's
  // display unit. Local state takes over once they start typing. Sticky
  // weight across sets works because we only clear reps on submit.
  const [reps, setReps] = useState(String(suggestion.reps));
  const [weight, setWeight] = useState(
    exercise.bodyweight ? "" : formatWeightInput(suggestion.weightKg, displayUnit),
  );

  // Running best Epley for this exercise, seeded with the historical PR and
  // updated whenever a set in THIS session beats it. Compared against each
  // newly-logged set's Epley: if the new set beats the running best, we
  // flash the PR banner and raise the bar. A single PR "sticks" on screen
  // until the user logs another set — no auto-dismiss, because the point
  // is to give them a moment to savor it.
  const [runningBestEpley, setRunningBestEpley] = useState(historicalBestEpley);
  const [prBanner, setPrBanner] = useState<null | { e1rm: number }>(null);

  const submit = () => {
    const r = parseInt(reps, 10);
    if (!Number.isFinite(r) || r <= 0) return;
    // Parse the weight input from the user's display unit into kg. For
    // bodyweight exercises we still store a weight field so the shape
    // stays uniform — default to 0 when the user leaves it blank.
    const kg = parseInputWeight(weight, displayUnit) ?? 0;
    onAddSet({ reps: r, weightKg: kg });

    // PR detection: only for weighted lifts (bodyweight Epley is always 0
    // or noise), and only once there's a real baseline to beat. Epley is
    // computed on the just-logged set; if it beats the running best we
    // raise the bar and show the banner.
    if (!exercise.bodyweight && kg > 0 && historicalBestEpley > 0) {
      const e = epleyOneRepMax(kg, r);
      if (e > runningBestEpley) {
        setRunningBestEpley(e);
        setPrBanner({ e1rm: e });
      }
    }

    setReps("");
  };

  const dismissPr = () => setPrBanner(null);

  return (
    <div
      className={
        "exercitium-exercise" +
        (exercise.closed ? " exercitium-exercise-closed" : "")
      }
    >
      <h3 className="exercitium-exercise-name">
        {exercise.displayName}
        {/* Set counter. Goes gold once the prescribed sets are in — a
            "done" marker the user can scan without reading the list. */}
        <span
          className={
            "exercitium-set-count" +
            (exercise.sets.length >= targetSets
              ? " exercitium-set-count-met"
              : "")
          }
        >
          {exercise.sets.length}/{targetSets} sets
        </span>
        <button
          type="button"
          className="exercitium-close-set"
          onClick={onToggleClosed}
          aria-pressed={exercise.closed}
          title={
            exercise.closed
              ? "Reopen — log more sets"
              : "Close — stop suggesting sets"
          }
        >
          {exercise.closed ? "Reopen" : "Close"}
        </button>
      </h3>

      {prBanner && (
        <PrBanner
          e1rm={prBanner.e1rm}
          displayUnit={displayUnit}
          onDismiss={dismissPr}
        />
      )}

      {/* Last-time reference and the next-set suggestion are both
          forward-looking prompts. Once the lift is closed they'd be
          nagging, so they go away with the input row. */}
      {!exercise.closed && suggestion.lastSets && suggestion.lastDate && (
        <p className="exercitium-subtitle">
          Last ({suggestion.lastDate}):{" "}
          {suggestion.lastSets
            .map((s) =>
              exercise.bodyweight && s.weightKg === 0
                ? `${s.reps}×BW`
                : `${s.reps}×${formatWeight(s.weightKg, displayUnit).replace(" ", "")}`,
            )
            .join(", ")}
        </p>
      )}

      {exercise.sets.length > 0 && (
        <ol className="exercitium-sets">
          {exercise.sets.map((s, i) => (
            <li key={i}>
              {s.reps} reps
              {exercise.bodyweight && s.weightKg === 0
                ? " · bodyweight"
                : ` · ${formatWeight(s.weightKg, displayUnit)}`}{" "}
              <button
                className="exercitium-btn exercitium-btn-secondary"
                style={{
                  padding: "0 0.4rem",
                  fontSize: "0.85rem",
                  marginLeft: "0.4rem",
                }}
                onClick={() => onDeleteSet(i)}
                aria-label={`Delete set ${i + 1}`}
                title="Delete set"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}

      {exercise.closed ? (
        <p className="exercitium-closed-note">
          Closed for today. Sets already logged are kept.
        </p>
      ) : (
        <div className="exercitium-row">
          <input
            type="number"
            inputMode="numeric"
            placeholder="reps"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="exercitium-input exercitium-input-narrow"
          />
          {!exercise.bodyweight && (
            <input
              type="number"
              inputMode="decimal"
              placeholder={unitLabel(displayUnit)}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="exercitium-input exercitium-input-narrow"
            />
          )}
          <button className="exercitium-btn" onClick={submit}>
            Log set
          </button>
        </div>
      )}
    </div>
  );
}
