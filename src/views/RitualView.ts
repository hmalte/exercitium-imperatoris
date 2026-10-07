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
import { RitualApp, type RitualMode } from "../react/RitualApp";
import type ExercitiumPlugin from "../main";

export const RITUAL_VIEW_TYPE = "exercitium-ritual";

export class RitualView extends ItemView {
  private mount: ReactMountHandle | null = null;
  /** Bumped on refocus so the exercise library is re-read. */
  private nonce = 0;
  /** Captured once: the mode must not be re-consumed on every re-render. */
  private mode: RitualMode = "auto";

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
    // Consumed once, here — re-reading it on every refresh would hand back
    // "auto" and silently drop a cardio-only launch.
    this.mode = this.plugin.consumePendingRitualMode();
    this.renderApp();
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf === this.leaf) {
          this.nonce++;
          this.renderApp();
        }
      }),
    );
  }

  private renderApp(): void {
    const adapter = new ObsidianVaultAdapter(this.app);
    const today = new Date().toISOString().slice(0, 10);
    const element = createElement(RitualApp, {
      adapter,
      today,
      displayUnit: this.plugin.settings.displayUnit,
      rotationOrder: this.plugin.settings.rotationOrder,
      incrementsKg: this.plugin.settings.incrementsKg,
      mode: this.mode,
      reloadNonce: this.nonce,
      onComplete: () => {
        this.leaf.detach();
      },
      onExit: () => {
        void this.plugin.returnToAltar(this.leaf);
      },
    });
    if (this.mount) {
      this.mount.render(element);
      return;
    }
    this.mount = mountReact(this.containerEl, element);
  }

  async onClose(): Promise<void> {
    this.mount?.unmount();
    this.mount = null;
  }
}
