// Exercitium Imperatoris — main plugin entry.
//
// On load the plugin:
//   1. Registers the four custom views + ribbon icons + command palette entries.
//   2. Wires the "Ritual Chamber" command — collapses sidebars and opens the
//      Altar so Obsidian's chrome retreats around the plugin canvas.
//   3. Watches active-leaf changes and toggles an `exercitium-active` class
//      on <body> whenever one of our views is focused. Scoped CSS in
//      styles.css uses that class to hide the tab header / status bar /
//      mobile sidebar toggles, which is the single highest-leverage piece
//      of grimdark immersion on mobile (per Phase 7 brief).
//   4. Seeds the vault with 41 exercises and two quote files if they're
//      missing. Safe to call on every launch — existing files are never
//      overwritten.

import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { AltarView, ALTAR_VIEW_TYPE } from "./views/AltarView";
import { RitualView, RITUAL_VIEW_TYPE } from "./views/RitualView";
import { SanctumView, SANCTUM_VIEW_TYPE } from "./views/SanctumView";
import { CodexView, CODEX_VIEW_TYPE } from "./views/CodexView";
import { ObsidianVaultAdapter } from "./obsidian/ObsidianVaultAdapter";
import { injectGlobalTheme, removeGlobalTheme } from "./obsidian/globalTheme";
import { ExercitiumSettingsTab } from "./obsidian/SettingsTab";
import { ChronicleModal } from "./obsidian/ChronicleModal";
import { seedVault } from "./domain/seed";
import { loadAllSessions } from "./domain/vault";
import { sessionsToCsv } from "./domain/csvExport";
import type { DisplayUnit } from "./domain/units";
import { type Equipment, type RotationOrderSlot } from "./domain/schemas";
import type { RitualMode } from "./react/RitualApp";
import {
  DEFAULT_ROTATION_PRESET,
  ROTATION_PRESETS,
  resolveRotationPreset,
  type RotationPresetId,
} from "./domain/rotationPresets";

// Plugin settings persisted via Obsidian's loadData/saveData. Kept small on
// purpose — the source of truth for workout data lives in the vault files.
// Adding a field here means a migration step later, so each addition should
// earn its place.
//
// Fields:
//   displayUnit     — kg / lb. Flipped from the Altar's "heretical measures"
//                     toggle; only affects display and input, never storage.
//   rotationPreset  — which named preset is active. The preset's `order`
//                     drives slot lookups in the Altar / Ritual. Switched
//                     from the free-form rotationOrder field in Phase 9 so
//                     the UI can expose a short named menu instead of an
//                     error-prone reorderable list.
//   rotationOrder   — resolved slot list for the active preset. Mirrored
//                     into settings on every preset change so existing
//                     reads (`settings.rotationOrder`) keep working without
//                     every call site needing to look up the preset.
//   incrementsKg    — default progression bump per equipment kind. Drives
//                     the Ritual's "+X kg next session" suggestions. Stored
//                     in kg regardless of displayUnit — the Settings tab
//                     converts for the user if they've chosen pounds.
export type ExercitiumSettings = {
  displayUnit: DisplayUnit;
  rotationPreset: RotationPresetId;
  rotationOrder: RotationOrderSlot[];
  incrementsKg: Record<Equipment, number>;
};

// Convenience default — the resolved order for the default preset. Kept so
// any call site that wants the ground-truth default without looking up the
// preset registry can still import a constant.
export const DEFAULT_ROTATION_ORDER: RotationOrderSlot[] = [
  ...ROTATION_PRESETS[DEFAULT_ROTATION_PRESET].order,
];

// Pragmatic defaults for each equipment type. Barbell/dumbbell/cable get the
// usual 2.5 kg micro-plate bump; machines tend to have bigger plate stacks;
// kettlebells jump ~4 kg between common sizes; bodyweight never adds load
// (progression runs off reps instead).
export const DEFAULT_INCREMENTS_KG: Record<Equipment, number> = {
  barbell: 2.5,
  dumbbell: 2.5,
  machine: 5,
  cable: 2.5,
  bodyweight: 0,
  kettlebell: 4,
};

const DEFAULT_SETTINGS: ExercitiumSettings = {
  displayUnit: "kg",
  rotationPreset: DEFAULT_ROTATION_PRESET,
  rotationOrder: DEFAULT_ROTATION_ORDER,
  incrementsKg: DEFAULT_INCREMENTS_KG,
};

// The set of view types that should trigger chrome-hiding when focused.
// New views added later (e.g. a cardio-finisher view in Phase 8) should be
// appended here so they get the same treatment.
const EXERCITIUM_VIEW_TYPES = new Set<string>([
  ALTAR_VIEW_TYPE,
  RITUAL_VIEW_TYPE,
  SANCTUM_VIEW_TYPE,
  CODEX_VIEW_TYPE,
]);

// CSS hook class. When present on <body>, styles.css hides Obsidian's
// tab header, status bar, and mobile sidebar toggles.
const EXERCITIUM_ACTIVE_CLASS = "exercitium-active";

export default class ExercitiumPlugin extends Plugin {
  /**
   * Mode the next Ritual leaf should open in.
   *
   * Obsidian constructs a view and calls onOpen() before any state we could
   * pass through setViewState is readable, so the mode is handed over here
   * instead. RitualView consumes it (resetting to "auto") the moment it
   * mounts, so a mode can never leak into a later, unrelated open.
   */
  private pendingRitualMode: RitualMode = "auto";

  /** In-memory mirror of the saved settings. Initialized in onloadGuarded.
   *  Views read from here at mount time; the Altar's "Use heretical
   *  measures" button writes through `setDisplayUnit` below. */
  settings: ExercitiumSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    // Diagnostic Notice. On mobile Obsidian, errors thrown during onload
    // are swallowed silently — the plugin shows as "enabled" in settings
    // but no commands or ribbon icons actually register. This Notice
    // proves onload started running; the try/catch below proves it
    // finished. If you see "Exercitium loaded" but no commands appear,
    // check the error Notice (and the developer console via the BRAT
    // / admonition / "Show debug info" workflow on Android).
    new Notice("Exercitium loaded");
    console.log(
      "[Exercitium Imperatoris] In nomine Imperatoris — plugin loaded."
    );

    try {
      await this.onloadGuarded();
    } catch (err) {
      console.error("[Exercitium Imperatoris] onload failed:", err);
      // Keep the Notice on screen longer than the default 5s — on mobile
      // the user may not be watching the screen during launch.
      new Notice(`Exercitium onload error: ${err}`, 20000);
    }
  }

  /**
   * The real body of onload. Split out so we can wrap it in a single
   * try/catch without indenting the whole thing. Any throw here surfaces
   * to the user via the Notice in onload() above.
   */
  private async onloadGuarded(): Promise<void> {
    // Load persisted settings first — views read `this.settings.displayUnit`
    // at mount time, so they need the real value before any view opens.
    // loadData() returns null on first run; `...DEFAULT_SETTINGS, ...loaded`
    // fills in defaults for any fields added in future versions.
    const loaded = (await this.loadData()) as Partial<ExercitiumSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(loaded ?? {}) };
    // Sanitize the rotation preset + order. Two sources of truth live in
    // settings: `rotationPreset` (the chosen ID) and `rotationOrder` (the
    // resolved slot list). We always re-resolve the order from the preset
    // on load — if a user hand-edited data.json to set a preset but left
    // the order stale, the preset wins. `resolveRotationPreset` falls back
    // to the default ID when the stored one is unknown (old data file,
    // typo, etc).
    const preset = resolveRotationPreset(this.settings.rotationPreset);
    this.settings.rotationPreset = preset.id;
    this.settings.rotationOrder = [...preset.order];
    // Heal missing increment keys (e.g. settings saved before we added a
    // new Equipment kind). Never overwrite user-chosen values that ARE set.
    this.settings.incrementsKg = {
      ...DEFAULT_INCREMENTS_KG,
      ...(this.settings.incrementsKg ?? {}),
    };

    // Inject global Obsidian theme. This overrides Obsidian's own CSS
    // variables (--background-primary, --text-normal, --interactive-accent,
    // fonts, etc.) so the entire app — file explorer, command palette,
    // settings, status bar — picks up the grimdark palette while this
    // plugin is enabled. Removed in onunload() so disabling the plugin
    // cleanly restores the user's normal theme.
    injectGlobalTheme();

    // Tell Obsidian how to construct each of our custom views. The views
    // take a back-reference to this plugin so they can read the live
    // `settings.displayUnit` at onOpen time and (for the Altar) call
    // setDisplayUnit when the user flips the toggle.
    this.registerView(ALTAR_VIEW_TYPE, (leaf) => new AltarView(leaf, this));
    this.registerView(RITUAL_VIEW_TYPE, (leaf) => new RitualView(leaf, this));
    this.registerView(SANCTUM_VIEW_TYPE, (leaf) => new SanctumView(leaf, this));
    this.registerView(CODEX_VIEW_TYPE, (leaf) => new CodexView(leaf, this));

    // Ribbon icon in Obsidian's left gutter. "skull" is a Lucide icon that
    // ships with Obsidian — good enough until Phase 7 swaps in custom SVGs.
    this.addRibbonIcon("skull", "Open the Altar", async () => {
      await this.activateAltar();
    });

    // Command palette entry. On mobile, Malte can pin this to the toolbar.
    this.addCommand({
      id: "open-altar",
      name: "Open the Altar",
      callback: async () => {
        await this.activateAltar();
      },
    });

    this.addRibbonIcon("scroll-text", "Open the Sanctum", async () => {
      await this.activateSanctum();
    });

    this.addCommand({
      id: "open-sanctum",
      name: "Open the Sanctum",
      callback: async () => {
        await this.activateSanctum();
      },
    });

    this.addRibbonIcon("book-marked", "Open the Codex Imperialis", async () => {
      await this.activateCodex();
    });

    this.addCommand({
      id: "open-codex",
      name: "Open the Codex Imperialis",
      callback: async () => {
        await this.activateCodex();
      },
    });

    // Summon the Chronicle — a modal weekly summary over the last 7 days.
    // Read-only; everything it shows is already in the Altar/Sanctum, just
    // collapsed to a single glance. Useful on mobile where paging between
    // views is friction. No ribbon icon on purpose — keeps the gutter spare.
    this.addCommand({
      id: "summon-chronicle",
      name: "Summon the Chronicle",
      callback: () => {
        const today = new Date().toISOString().slice(0, 10);
        new ChronicleModal(this.app, this.settings.displayUnit, today).open();
      },
    });

    // Export every session to a single flat CSV file. Peace-of-mind backup
    // — the markdown files under sessions/ are already the source of truth,
    // but a single CSV is easier to copy off-device or open in a spreadsheet
    // if something ever goes sideways with Obsidian or the plugin.
    this.addCommand({
      id: "export-sessions-csv",
      name: "Export sessions to CSV",
      callback: async () => {
        await this.exportSessionsCsv();
      },
    });

    // Settings tab — Phase 8 admin surface. Declare LoA, trigger cardio week,
    // re-seed the vault, or purge plugin data. Registered after the views so
    // the plugin shows up in Settings with all its commands discoverable
    // from the tab's description.
    this.addSettingTab(new ExercitiumSettingsTab(this.app, this));

    // Enter the Ritual Chamber — the "immersion preset". Collapses both
    // sidebars and opens the Altar. On mobile, Malte pins this command to
    // the Obsidian toolbar so one tap takes him from the app icon to a
    // chrome-free grimdark canvas.
    this.addCommand({
      id: "enter-ritual-chamber",
      name: "Enter the Ritual Chamber",
      callback: async () => {
        await this.enterRitualChamber();
      },
    });

    // Watch active-leaf changes. Whenever focus moves into or out of one of
    // our views we refresh the body class. The event fires on initial layout
    // too, but we ALSO poll once after onLayoutReady to catch the case where
    // the plugin loads into an already-open Altar leaf.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.syncChromeClass()),
    );
    this.app.workspace.onLayoutReady(() => this.syncChromeClass());

    // First-run seed. We run this in the background so a slow vault doesn't
    // block plugin startup. If it fails we surface the actual error message
    // — on mobile there's no dev console, so swallowing the detail strands
    // the user. 20s timeout so you have time to read it on a phone.
    this.runSeed().catch((err) => {
      console.error("[Exercitium Imperatoris] Seed failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Exercitium seed error: ${msg}`, 20000);
    });
  }

  async onunload() {
    // Obsidian automatically detaches registered views when a plugin unloads,
    // but our body class is NOT registered with it — we have to strip it
    // ourselves or Obsidian's chrome stays hidden after the plugin unloads.
    document.body.classList.remove(EXERCITIUM_ACTIVE_CLASS);

    // Rip out the injected <style> element and the theme-active body class
    // so disabling the plugin fully restores Obsidian's default look.
    removeGlobalTheme();
  }

  /**
   * Add/remove the body class based on whether the currently focused leaf
   * is one of ours. Cheap enough to run on every leaf change.
   */
  private syncChromeClass(): void {
    const leaf = this.app.workspace.activeLeaf;
    const viewType = leaf?.view?.getViewType();
    const shouldHide =
      typeof viewType === "string" && EXERCITIUM_VIEW_TYPES.has(viewType);
    document.body.classList.toggle(EXERCITIUM_ACTIVE_CLASS, shouldHide);
  }

  /**
   * Collapse both sidebars and open the Altar. Not a saved Obsidian
   * workspace layout (those need user interaction to create) — instead
   * we reproduce the end state directly, which is what the brief actually
   * wants: one tap → Altar with no chrome.
   */
  private async enterRitualChamber(): Promise<void> {
    const { workspace } = this.app;
    // collapse() is a no-op if the split is already collapsed, so this is
    // idempotent and safe to re-run.
    workspace.leftSplit.collapse();
    workspace.rightSplit.collapse();
    await this.activateAltar();
    this.syncChromeClass();
  }

  /**
   * Open the Altar view. If one is already open anywhere in the workspace,
   * reveal that existing leaf instead of opening a duplicate tab.
   */
  private async activateAltar(): Promise<void> {
    const { workspace } = this.app;

    const existing = workspace.getLeavesOfType(ALTAR_VIEW_TYPE)[0];
    if (existing) {
      workspace.revealLeaf(existing);
      return;
    }

    // `getLeaf(true)` opens a new leaf in the main workspace area.
    const leaf: WorkspaceLeaf = workspace.getLeaf(true);
    await leaf.setViewState({ type: ALTAR_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  /** Open (or reveal) the Sanctum view. */
  private async activateSanctum(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(SANCTUM_VIEW_TYPE)[0];
    if (existing) {
      workspace.revealLeaf(existing);
      return;
    }
    const leaf: WorkspaceLeaf = workspace.getLeaf(true);
    await leaf.setViewState({ type: SANCTUM_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  /**
   * Back navigation for the leaf views. The Ritual Chamber collapses both
   * sidebars and the global theme hides Obsidian's tab chrome, so a view
   * with no way out strands the user — every view gets a back control that
   * lands here.
   *
   * Opens (or reveals) the Altar first, THEN detaches the caller's leaf.
   * Doing it in that order means the workspace always has one of our views
   * focused; detaching first would flash whatever leaf happened to be
   * underneath. Detaching rather than just revealing keeps the tab strip
   * from accumulating a Sanctum, a Codex and three Rituals over a week.
   */
  async returnToAltar(leaf: WorkspaceLeaf): Promise<void> {
    await this.activateAltar();
    leaf.detach();
  }

  /**
   * Open (or reveal) the Ritual view.
   *
   * If a Ritual leaf is already open we reveal it rather than replacing it,
   * even when a different `mode` was asked for — an open Ritual means a
   * workout in progress, and silently swapping it for a cardio screen would
   * throw away what the user is doing. In practice this is rare: both
   * completing and backing out of the Ritual detach the leaf.
   */
  async openRitual(mode: RitualMode = "auto"): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(RITUAL_VIEW_TYPE)[0];
    if (existing) {
      workspace.revealLeaf(existing);
      return;
    }
    this.pendingRitualMode = mode;
    const leaf = workspace.getLeaf(true);
    await leaf.setViewState({ type: RITUAL_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  /** Read and clear the mode for the Ritual leaf now mounting. */
  consumePendingRitualMode(): RitualMode {
    const mode = this.pendingRitualMode;
    this.pendingRitualMode = "auto";
    return mode;
  }

  /** Open (or reveal) the Codex Imperialis view. */
  private async activateCodex(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(CODEX_VIEW_TYPE)[0];
    if (existing) {
      workspace.revealLeaf(existing);
      return;
    }
    const leaf: WorkspaceLeaf = workspace.getLeaf(true);
    await leaf.setViewState({ type: CODEX_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  /**
   * Flip the user's display unit and persist it. Called from the Altar's
   * "Use heretical measures" button. The in-memory `settings.displayUnit`
   * updates synchronously so any leaf that re-mounts after this sees the
   * new unit; saveData persists it for the next plugin load.
   */
  async setDisplayUnit(unit: DisplayUnit): Promise<void> {
    this.settings.displayUnit = unit;
    await this.saveData(this.settings);
  }

  /**
   * Switch to a named rotation preset. Writes both the preset ID and the
   * resolved slot order so downstream reads of `settings.rotationOrder`
   * keep seeing the list that matches the chosen preset. Called from the
   * settings tab's preset dropdown.
   */
  async setRotationPreset(id: RotationPresetId): Promise<void> {
    const preset = resolveRotationPreset(id);
    this.settings.rotationPreset = preset.id;
    this.settings.rotationOrder = [...preset.order];
    await this.saveData(this.settings);
  }

  /** Update a single equipment kind's default progression increment in kg. */
  async setIncrementKg(equipment: Equipment, kg: number): Promise<void> {
    this.settings.incrementsKg = {
      ...this.settings.incrementsKg,
      [equipment]: kg,
    };
    await this.saveData(this.settings);
  }

  /**
   * Write every session to `exports/sessions-YYYY-MM-DD.csv`. Overwrites the
   * file for the same day on purpose — if the user runs the command twice
   * in one day, they want the newer export, not a forest of near-duplicates.
   */
  private async exportSessionsCsv(): Promise<void> {
    try {
      const adapter = new ObsidianVaultAdapter(this.app);
      const sessions = await loadAllSessions(adapter);
      const csv = sessionsToCsv(sessions);
      const today = new Date().toISOString().slice(0, 10);
      const path = `exports/sessions-${today}.csv`;
      await adapter.ensureFolder("exports");
      await adapter.writeFile(path, csv);
      new Notice(
        `Exercitium: exported ${sessions.length} sessions to ${path}.`,
      );
    } catch (err) {
      console.error("[Exercitium Imperatoris] CSV export failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Exercitium CSV export error: ${msg}`, 20000);
    }
  }

  /** Idempotent: only writes files that don't already exist. */
  private async runSeed(): Promise<void> {
    const adapter = new ObsidianVaultAdapter(this.app);
    const report = await seedVault(adapter);
    if (
      report.exercisesCreated > 0 ||
      report.quotesCreated > 0 ||
      report.basesCreated > 0
    ) {
      console.log(
        `[Exercitium Imperatoris] Seeded vault: ` +
          `${report.exercisesCreated} exercises, ` +
          `${report.quotesCreated} quote files, ` +
          `${report.basesCreated} Base files.`,
      );
      new Notice(
        `Exercitium: seeded ${report.exercisesCreated} exercises, ` +
          `${report.quotesCreated} quote files, and ` +
          `${report.basesCreated} Base files.`,
      );
    }
  }
}
