// The Ritual view — an Obsidian ItemView that hosts a React app.
//
// All the actual UI logic lives in RitualApp.tsx. This file is the thin
// Obsidian adapter that:
//   1. Tells Obsidian how to construct the leaf (icon, title, view type).
//   2. Mounts the React root on open.
//   3. Unmounts it on close so React can clean up event handlers.

import { ItemView, WorkspaceLeaf } from "obsidian";
import { createElement } from "react";
import { mountReact, type ReactMountHandle } from "../obsidian/reactMount";
import { ObsidianVaultAdapter } from "../obsidian/ObsidianVaultAdapter";
import { RitualApp } from "../react/RitualApp";
import type ExercitiumPlugin from "../main";

export const RITUAL_VIEW_TYPE = "exercitium-ritual";

export class RitualView extends ItemView {
  private mount: ReactMountHandle | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: ExercitiumPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return RITUAL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "The Ritual";
  }

  getIcon(): string {
    return "flame";
  }

  async onOpen(): Promise<void> {
    const adapter = new ObsidianVaultAdapter(this.app);
    // Compute today's date once at open time. UI treats it as stable even if
    // the user is crossing midnight mid-workout.
    const today = new Date().toISOString().slice(0, 10);

    this.mount = mountReact(
      this.containerEl,
      // React.createElement because this file is .ts, not .tsx. The actual
      // RitualApp component uses JSX internally.
      createElement(RitualApp, {
        adapter,
        today,
        displayUnit: this.plugin.settings.displayUnit,
        rotationOrder: this.plugin.settings.rotationOrder,
        incrementsKg: this.plugin.settings.incrementsKg,
        // Consumed (and reset to "auto") here, so a cardio-only launch can't
        // leak into the next Ritual the user opens normally.
        mode: this.plugin.consumePendingRitualMode(),
        onComplete: () => {
          // Detach the leaf (closes the view tab). Workspace will reveal the
          // previously active leaf, which is usually the Altar.
          this.leaf.detach();
        },
        // Backing out of the Ritual before it's saved. Explicitly opens the
        // Altar rather than relying on detach revealing whatever was
        // underneath — the user came here to go BACK, and "back" from the
        // Ritual has exactly one meaning. Any logged sets are already in
        // the autosaved draft and are offered again on the next open.
        onExit: () => {
          void this.plugin.returnToAltar(this.leaf);
        },
      }),
    );
  }

  async onClose(): Promise<void> {
    this.mount?.unmount();
    this.mount = null;
  }
}
