// THE CHRONICLE — a weekly summary modal.
//
// Command: "Summon the Chronicle" (see main.ts). On open, reads the vault
// once and shows a single-screen summary of the last 7 calendar days:
//   - session count
//   - total effective sets (same primary=1 / secondary=0.5 math as the
//     rare-companion achievement — the numbers line up so the user can
//     watch their week walk toward 69)
//   - total tonnage (weight × reps across every set, no muscle weighting)
//   - top 3 muscle groups by effective sets
//   - total cardio minutes
//   - current streak
//
// Everything is computed inline here — the modal is a read-only view so
// there's no state to thread. Closing the modal (Esc, click-outside, or
// the ✕) disposes the node; nothing else to tear down.

import { App, Modal } from "obsidian";
import { ObsidianVaultAdapter } from "./ObsidianVaultAdapter";
import {
  loadAllExercises,
  loadAllLoAs,
  loadAllSessions,
} from "../domain/vault";
import { addDays, computeCurrentStreak, type ISODate } from "../domain/timeLogic";
import { computeMuscleStats } from "../domain/volume";
import { MUSCLE_TO_GROUP, type MuscleGroup } from "../domain/landmarks";
import { totalEffectiveSets } from "../domain/achievements";
import { type DisplayUnit, kgToDisplay, unitLabel } from "../domain/units";

const WINDOW_DAYS = 7;

export class ChronicleModal extends Modal {
  constructor(
    app: App,
    private displayUnit: DisplayUnit,
    private today: ISODate,
  ) {
    super(app);
  }

  async onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("exercitium-chronicle-modal");
    contentEl.addClass("exercitium-chronicle");
    // Placeholder while we wait on vault reads — the modal is already visible
    // at this point, so an empty shell feels broken. One short line keeps it
    // intentional.
    contentEl.createEl("p", {
      text: "Consulting the archives…",
      cls: "exercitium-chronicle-loading",
    });

    let sessions, exercises, loas;
    try {
      const adapter = new ObsidianVaultAdapter(this.app);
      [sessions, exercises, loas] = await Promise.all([
        loadAllSessions(adapter),
        loadAllExercises(adapter),
        loadAllLoAs(adapter),
      ]);
    } catch (err) {
      contentEl.empty();
      contentEl.createEl("h2", {
        text: "THE CHRONICLE",
        cls: "exercitium-chronicle-title",
      });
      contentEl.createEl("pre", {
        text: String(err),
        cls: "exercitium-error",
      });
      return;
    }

    const cutoff = addDays(this.today, -(WINDOW_DAYS - 1));
    const inWindow = sessions.filter(
      (s) => s.date >= cutoff && s.date <= this.today,
    );

    // Effective sets — same weighting as the rare-companion detector so the
    // Chronicle and the achievement read the same number.
    const effSets = inWindow.reduce(
      (acc, s) => acc + totalEffectiveSets(s, exercises),
      0,
    );

    // Raw tonnage. Walk every session in date order so the running
    // bodyweight stays current for bodyweight-exercise estimation, exactly
    // like the Sanctum's tonnage math.
    const exById = new Map(exercises.map((e) => [e.id, e]));
    let totalTonnageKg = 0;
    let runningBw: number | null = null;
    const sorted = [...sessions].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    for (const s of sorted) {
      if (s.bodyweightKg !== null) runningBw = s.bodyweightKg;
      if (s.date < cutoff || s.date > this.today) continue;
      for (const sessEx of s.exercises) {
        const def = exById.get(sessEx.name);
        if (!def) continue;
        for (const set of sessEx.sets) {
          const effWeight = def.bodyweight
            ? (runningBw ?? 0) + set.weightKg
            : set.weightKg;
          totalTonnageKg += effWeight * set.reps;
        }
      }
    }

    // Top 3 muscle groups by sets. Uses the same per-muscle rollup the
    // Sanctum feeds into, then collapses to groups so "back" + "lats" count
    // as one entry and the list stays tight.
    const muscleStats = computeMuscleStats(
      sessions,
      exercises,
      WINDOW_DAYS,
      this.today,
    );
    const groupSets = new Map<MuscleGroup, number>();
    for (const m of muscleStats) {
      const g = MUSCLE_TO_GROUP[m.muscle];
      groupSets.set(g, (groupSets.get(g) ?? 0) + m.sets);
    }
    const topGroups = Array.from(groupSets.entries())
      .filter(([, sets]) => sets > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const cardioMinutes = inWindow.reduce(
      (acc, s) => acc + (s.cardioMinutes ?? 0),
      0,
    );

    const streak = computeCurrentStreak(sessions, loas, this.today);

    // ---- Render -----------------------------------------------------------
    contentEl.empty();

    contentEl.createEl("div", { cls: "exercitium-chronicle-header" }, (h) => {
      h.createEl("h2", {
        text: "THE CHRONICLE",
        cls: "exercitium-chronicle-title",
      });
      h.createEl("p", {
        text: `The last seven days — ${cutoff} through ${this.today}.`,
        cls: "exercitium-chronicle-subtitle",
      });
    });

    const grid = contentEl.createEl("div", {
      cls: "exercitium-chronicle-grid",
    });
    stat(grid, "Sessions", String(inWindow.length));
    stat(grid, "Effective sets", formatSets(effSets));
    stat(
      grid,
      `Tonnage (${unitLabel(this.displayUnit)})`,
      Math.round(kgToDisplay(totalTonnageKg, this.displayUnit)).toLocaleString(),
    );
    stat(grid, "Cardio (min)", String(cardioMinutes));
    stat(grid, "Streak", `${streak} ${streak === 1 ? "day" : "days"}`);
    // Flag the user if they've crossed the rare-week line this week — the
    // Chronicle is the natural place to say "you are already here".
    if (effSets >= 69) {
      stat(grid, "Rare week", "YES", /* highlight */ true);
    }

    if (topGroups.length > 0) {
      contentEl.createEl("h3", {
        text: "TOP MUSCLE GROUPS",
        cls: "exercitium-chronicle-section-heading",
      });
      const list = contentEl.createEl("ul", {
        cls: "exercitium-chronicle-toplist",
      });
      for (const [group, sets] of topGroups) {
        const li = list.createEl("li");
        li.createEl("span", { text: prettyGroup(group) });
        li.createEl("span", {
          text: `${formatSets(sets)} sets`,
          cls: "exercitium-chronicle-toplist-num",
        });
      }
    } else {
      contentEl.createEl("p", {
        text: "No muscle group stats yet — log a session to begin the Chronicle.",
        cls: "exercitium-chronicle-empty",
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// --- small DOM helpers kept local to this file -------------------------------

function stat(
  parent: HTMLElement,
  label: string,
  value: string,
  highlight = false,
): void {
  const cell = parent.createEl("div", {
    cls:
      "exercitium-chronicle-stat" +
      (highlight ? " exercitium-chronicle-stat-highlight" : ""),
  });
  cell.createEl("div", {
    text: value,
    cls: "exercitium-chronicle-stat-value",
  });
  cell.createEl("div", {
    text: label,
    cls: "exercitium-chronicle-stat-label",
  });
}

function prettyGroup(group: MuscleGroup): string {
  return group
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
