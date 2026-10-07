// Exercitium Imperatoris — plugin settings tab.
//
// Scope (per Phase 8 brief): action buttons for the rough-edge / admin
// tasks that don't belong in the Altar or Ritual views. Volume landmarks,
// rest timer, and vault root are deferred — landmarks live in a markdown
// file users can edit directly, rest timer was dropped from v1, and the
// vault root is hardcoded to the dev vault for now.
//
// What's here:
//   - Declare Leave of Absence (end date + reason, writes an LoA file)
//   - Trigger Cardio Week today (writes today's session with isCardioWeek=true)
//   - Re-seed exercises & quotes (rerun the idempotent seeder to fill gaps)
//   - Reset plugin state (nuclear — type-to-confirm, deletes all data)
//
// This tab talks to the vault through the same VaultAdapter the views use,
// so there's no special-case code path for "settings-side writes".

import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ExercitiumPlugin from "../main";
import { ObsidianVaultAdapter } from "./ObsidianVaultAdapter";
import {
  DIRS,
  loadAllSessions,
  saveLoA,
  saveSession,
} from "../domain/vault";
import { seedVault, applyShippedPlan } from "../domain/seed";
import type { Equipment, LoAFile, SessionFile } from "../domain/schemas";
import {
  ROTATION_PRESET_IDS,
  ROTATION_PRESETS,
  type RotationPresetId,
} from "../domain/rotationPresets";

// Equipment kinds that can take a weight increment. Bodyweight is included
// so users can see it on the list (and so the UI stays exhaustive), but
// its input is disabled — progression adds reps, not kilos.
const EQUIPMENT_ORDER: Equipment[] = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "kettlebell",
  "bodyweight",
];

// Display labels for rotation slots, including the special "cardio" slot
// that only appears inside a preset's order (never as a tag on an
// exercise file). Schema values are snake-case; UI gets capitalized.
const SLOT_LABEL: Record<string, string> = {
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  upper: "Upper",
  lower: "Lower",
  cardio: "Cardio",
};

const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  machine: "Machine",
  cable: "Cable",
  kettlebell: "Kettlebell",
  bodyweight: "Bodyweight",
};

// The master "confirm" phrase the user must type verbatim before the
// destructive reset will run. Caps on purpose — it's friction, not just
// legalese. Short enough that mobile typing isn't a chore, long enough
// that a stray tap never submits it.
const RESET_CONFIRM_PHRASE = "PURGE";

export class ExercitiumSettingsTab extends PluginSettingTab {
  // State the Setting components bind to. Kept on the tab instance so the
  // text inputs aren't remounted between renders (every `display()` call
  // wipes the container, but we want the partially-typed values to persist
  // across re-renders such as when the user toggles a toggle).
  private loaEndDate: string = "";
  private loaReason: string = "";
  private resetConfirm: string = "";

  constructor(app: App, private plugin: ExercitiumPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Exercitium Imperatoris" });
    containerEl.createEl("p", {
      text: "Admin actions for the Imperial workout plugin. Most day-to-day controls live in the Altar and Ritual; this tab is for deployment declarations and vault maintenance.",
    });

    this.renderRotationSection(containerEl);
    this.renderIncrementsSection(containerEl);
    this.renderLoASection(containerEl);
    this.renderPlanSection(containerEl);
    this.renderCardioWeekSection(containerEl);
    this.renderReseedSection(containerEl);
    this.renderRegenerateBasesSection(containerEl);
    this.renderResetSection(containerEl);
  }

  // ---------------------------------------------------------------------
  // Rotation preset
  // ---------------------------------------------------------------------
  //
  // The user picks a named preset (Litany of Muscle, Astartes Triptych,
  // Sanguinary Split) from a dropdown. Each preset ships a fixed slot
  // order; the user cannot reorder within a preset. The trade-off is
  // less flexibility for more safety — the sanitizer in main.ts can
  // trust the order because it's always re-resolved from the preset ID,
  // and a hand-edited data.json can't produce a broken 4-slot rotation
  // with a duplicate "push".
  //
  // Below the dropdown we render a read-only list showing the resolved
  // slot sequence, so the user can see at a glance what "Sanguinary
  // Split" expands to without tapping through a separate help modal.

  private renderRotationSection(root: HTMLElement): void {
    root.createEl("h3", { text: "Rotation preset" });
    root.createEl("p", {
      text: "The strength cycle. Pick a named preset — each ships a fixed slot order. The Altar shows whichever slot is next; the Ritual lands on that slot when you begin.",
      cls: "setting-item-description",
    });

    const current = this.plugin.settings.rotationPreset;

    new Setting(root)
      .setName("Preset")
      .setDesc(ROTATION_PRESETS[current].description)
      .addDropdown((dd) => {
        for (const id of ROTATION_PRESET_IDS) {
          dd.addOption(id, ROTATION_PRESETS[id].name);
        }
        dd.setValue(current);
        dd.onChange(async (v) => {
          await this.plugin.setRotationPreset(v as RotationPresetId);
          this.display();
        });
      });

    // Read-only slot list for the active preset, so the user can see what
    // the named option actually expands to without digging.
    const list = root.createEl("ol", {
      cls: "exercitium-settings-preset-list",
    });
    for (const slot of ROTATION_PRESETS[current].order) {
      list.createEl("li", { text: SLOT_LABEL[slot] ?? slot });
    }
  }

  // ---------------------------------------------------------------------
  // Movement-pattern (equipment) increments
  // ---------------------------------------------------------------------
  //
  // One numeric input per equipment kind. Drives the progression
  // suggestion's "+X kg next session" jump. Stored in kg regardless of
  // display unit — grammatically simpler than converting both ways, and
  // the user only sees these values when explicitly editing them.

  private renderIncrementsSection(root: HTMLElement): void {
    root.createEl("h3", { text: "Progression increments" });
    root.createEl("p", {
      text: "Weight jump (in kg) applied when a lift graduates its rep range. Barbell / dumbbell / cable default to 2.5 kg, machines to 5 kg, kettlebells to 4 kg. Bodyweight exercises never add load — they progress by adding reps — so that row is read-only.",
      cls: "setting-item-description",
    });

    for (const eq of EQUIPMENT_ORDER) {
      const current = this.plugin.settings.incrementsKg[eq];
      const setting = new Setting(root).setName(EQUIPMENT_LABEL[eq]);
      setting.addText((text) => {
        text
          .setPlaceholder("2.5")
          .setValue(String(current))
          .onChange(async (v) => {
            const parsed = Number.parseFloat(v);
            if (!Number.isFinite(parsed) || parsed < 0) return;
            await this.plugin.setIncrementKg(eq, parsed);
          });
        if (eq === "bodyweight") {
          text.inputEl.disabled = true;
        }
      });
    }
  }

  // ---------------------------------------------------------------------
  // Declare Leave of Absence
  // ---------------------------------------------------------------------

  private renderLoASection(root: HTMLElement): void {
    root.createEl("h3", { text: "Declare Leave of Absence" });
    root.createEl("p", {
      text: "Pauses the streak and deload counter from today through the end date. Body stays on the roster; soul goes on deployment.",
      cls: "setting-item-description",
    });

    new Setting(root)
      .setName("End date")
      .setDesc("YYYY-MM-DD. The LoA runs from today through this date inclusive.")
      .addText((text) =>
        text
          .setPlaceholder("2026-05-01")
          .setValue(this.loaEndDate)
          .onChange((v) => {
            this.loaEndDate = v.trim();
          }),
      );

    new Setting(root)
      .setName("Reason")
      .setDesc("Travel, illness, conference — a short line for the record.")
      .addText((text) =>
        text
          .setPlaceholder("Deployment to the Cadian front")
          .setValue(this.loaReason)
          .onChange((v) => {
            this.loaReason = v;
          }),
      );

    new Setting(root).addButton((btn) =>
      btn
        .setButtonText("Declare Leave of Absence")
        .setCta()
        .onClick(async () => {
          const today = new Date().toISOString().slice(0, 10);
          // Validate end date: must parse as a date and be >= today.
          if (!/^\d{4}-\d{2}-\d{2}$/.test(this.loaEndDate)) {
            new Notice("End date must be YYYY-MM-DD.");
            return;
          }
          if (this.loaEndDate < today) {
            new Notice("End date cannot be before today.");
            return;
          }
          const loa: LoAFile = {
            start: today,
            end: this.loaEndDate,
            reason: this.loaReason.trim(),
            notes: "",
          };
          try {
            const adapter = new ObsidianVaultAdapter(this.plugin.app);
            await saveLoA(adapter, loa);
            new Notice(
              `Leave of Absence declared: ${loa.start} → ${loa.end}. The Emperor understands.`,
            );
            this.loaEndDate = "";
            this.loaReason = "";
            this.display();
          } catch (e) {
            new Notice(`Failed to declare LoA: ${String(e)}`, 8000);
          }
        }),
    );
  }

  // ---------------------------------------------------------------------
  // Apply the shipped exercise plan
  // ---------------------------------------------------------------------

  private renderPlanSection(root: HTMLElement): void {
    root.createEl("h3", { text: "Apply the shipped exercise plan" });
    root.createEl("p", {
      text:
        "Rewrites every exercise definition to match the programme that ships " +
        "with this version of the plugin — which day each lift belongs to, its " +
        "running order, set target and muscle mapping. Use it when the plugin " +
        "has updated but the workout has not. Your training history is not " +
        "touched: sessions reference exercises by id, so every logged set stays " +
        "attached. Notes you have written under an exercise are preserved.",
      cls: "setting-item-description",
    });

    new Setting(root).addButton((btn) => {
      btn.setButtonText("Apply plan");
      btn.onClick(async () => {
        try {
          const adapter = new ObsidianVaultAdapter(this.plugin.app);
          const r = await applyShippedPlan(adapter);
          new Notice(
            `Plan applied. ${r.updated} updated, ${r.created} added, ` +
              `${r.unchanged} already current.`,
            8000,
          );
        } catch (e) {
          new Notice(`Failed to apply the plan: ${String(e)}`, 8000);
        }
      });
    });
  }

  // ---------------------------------------------------------------------
  // Trigger Cardio Week today
  // ---------------------------------------------------------------------

  private renderCardioWeekSection(root: HTMLElement): void {
    root.createEl("h3", { text: "Trigger Cardio Week" });
    root.createEl("p", {
      text: "Marks today as a Cardio Week session. The derived 7-day cardio window starts from the first flagged day — repeat this each day you want counted, or log through the Altar after this.",
      cls: "setting-item-description",
    });

    new Setting(root).addButton((btn) =>
      btn
        .setButtonText("Start Cardio Week today")
        .onClick(async () => {
          const today = new Date().toISOString().slice(0, 10);
          try {
            const adapter = new ObsidianVaultAdapter(this.plugin.app);
            const existing = await loadAllSessions(adapter);
            if (existing.some((s) => s.date === today)) {
              new Notice(
                `A session already exists for ${today}. Edit or delete it first.`,
                8000,
              );
              return;
            }
            const session: SessionFile = {
              date: today,
              rotationPosition: null,
              rotationSlot: "cardio",
              isCardioWeek: true,
              sleepHours: null,
              bodyweightKg: null,
              cardioMinutes: null,
              cardioType: null,
              cleanseType: null,
              exercises: [],
              notes: "Cardio Week decreed manually from settings.",
            };
            await saveSession(adapter, session);
            new Notice(
              "Cardio Week decreed. THE PENITENT MUST REST.",
            );
          } catch (e) {
            new Notice(`Failed to start Cardio Week: ${String(e)}`, 8000);
          }
        }),
    );
  }

  // ---------------------------------------------------------------------
  // Re-seed exercises & quotes
  // ---------------------------------------------------------------------

  private renderReseedSection(root: HTMLElement): void {
    root.createEl("h3", { text: "Re-seed exercises & quotes" });
    root.createEl("p", {
      text: "Recreates any missing default exercise files and the two quote pools. Safe to run — existing files are never overwritten.",
      cls: "setting-item-description",
    });

    new Setting(root).addButton((btn) =>
      btn.setButtonText("Re-seed now").onClick(async () => {
        try {
          const adapter = new ObsidianVaultAdapter(this.plugin.app);
          const report = await seedVault(adapter);
          new Notice(
            `Re-seeded: ${report.exercisesCreated} exercises, ${report.quotesCreated} quote files.`,
          );
        } catch (e) {
          new Notice(`Re-seed failed: ${String(e)}`, 8000);
        }
      }),
    );
  }

  // ---------------------------------------------------------------------
  // Regenerate Base files (plugin-owned overwrite)
  // ---------------------------------------------------------------------

  private renderRegenerateBasesSection(root: HTMLElement): void {
    root.createEl("h3", { text: "Regenerate Base files" });
    root.createEl("p", {
      text: "Overwrites the plugin's .base files in bases/ so they reflect the latest shipped versions. Safe in general — but any custom edits to these .base files will be lost.",
      cls: "setting-item-description",
    });

    new Setting(root).addButton((btn) =>
      btn.setButtonText("Regenerate now").onClick(async () => {
        try {
          const adapter = new ObsidianVaultAdapter(this.plugin.app);
          const report = await seedVault(adapter, { overwriteBases: true });
          new Notice(
            `Regenerated ${report.basesCreated} Base files in bases/.`,
          );
        } catch (e) {
          new Notice(`Regenerate failed: ${String(e)}`, 8000);
        }
      }),
    );
  }

  // ---------------------------------------------------------------------
  // Reset plugin state (nuclear)
  // ---------------------------------------------------------------------

  private renderResetSection(root: HTMLElement): void {
    root.createEl("h3", { text: "Reset plugin state" });
    root.createEl("p", {
      text: `Deletes every session, LoA, and quote file the plugin manages. The exercise library is left alone (you can re-seed it if you like). Type ${RESET_CONFIRM_PHRASE} below to enable the button.`,
      cls: "setting-item-description",
    });

    new Setting(root)
      .setName("Confirmation")
      .setDesc(`Type ${RESET_CONFIRM_PHRASE} verbatim to confirm.`)
      .addText((text) =>
        text
          .setPlaceholder(RESET_CONFIRM_PHRASE)
          .setValue(this.resetConfirm)
          .onChange((v) => {
            this.resetConfirm = v;
            // Re-render so the button's disabled state updates. Cheap — the
            // whole tab is ~50 DOM nodes.
            this.display();
          }),
      );

    new Setting(root).addButton((btn) => {
      btn.setButtonText("Purge vault data").setWarning();
      if (this.resetConfirm !== RESET_CONFIRM_PHRASE) {
        btn.setDisabled(true);
      }
      btn.onClick(async () => {
        if (this.resetConfirm !== RESET_CONFIRM_PHRASE) return;
        try {
          const adapter = new ObsidianVaultAdapter(this.plugin.app);
          await deleteFolderContents(adapter, DIRS.sessions);
          await deleteFolderContents(adapter, DIRS.loas);
          await deleteFolderContents(adapter, DIRS.quotes);
          new Notice(
            "Vault data purged. The archive begins anew.",
            8000,
          );
          this.resetConfirm = "";
          this.display();
        } catch (e) {
          new Notice(`Purge failed: ${String(e)}`, 8000);
        }
      });
    });
  }
}

// Helper: delete every file directly inside a folder via the existing
// VaultAdapter API. Kept local to this file because no other caller
// benefits from a "delete-all-in" primitive — the production path creates
// files, it doesn't mass-delete them.
async function deleteFolderContents(
  adapter: ObsidianVaultAdapter,
  folder: string,
): Promise<void> {
  if (!(await adapter.exists(folder))) return;
  const paths = await adapter.listFiles(folder);
  for (const p of paths) {
    await adapter.deleteFile(p);
  }
}
