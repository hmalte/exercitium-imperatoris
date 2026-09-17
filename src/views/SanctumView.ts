// The Sanctum view — Obsidian ItemView hosting the per-muscle table.
//
// Same thin-adapter pattern as AltarView/RitualView: construct the adapter,
// pick today's date, mount the React app, unmount on close.

import { ItemView, WorkspaceLeaf } from "obsidian";
import { createElement } from "react";
import { mountReact, type ReactMountHandle } from "../obsidian/reactMount";
import { ObsidianVaultAdapter } from "../obsidian/ObsidianVaultAdapter";
import { SanctumApp } from "../react/SanctumApp";
import type ExercitiumPlugin from "../main";

export const SANCTUM_VIEW_TYPE = "exercitium-sanctum";

export class SanctumView extends ItemView {
  private mount: ReactMountHandle | null = null;
  /** Bumped on every refocus so the React app re-reads the vault. */
  private nonce = 0;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: ExercitiumPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return SANCTUM_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "The Sanctum";
  }

  getIcon(): string {
    return "scroll-text";
  }

  async onOpen(): Promise<void> {
    this.renderApp();
    // Obsidian keeps a leaf alive after you navigate away, so this view's
    // data would otherwise be whatever it read the first time it opened —
    // stale the moment a Ritual saves a session. Re-render whenever this
    // leaf regains focus; the bumped nonce is what makes the React app
    // re-read the vault.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf === this.leaf) {
          this.nonce++;
          this.renderApp();
        }
      }),
    );
  }

  /** (Re)render the React tree with current settings and a fresh nonce. */
  private renderApp(): void {
    const adapter = new ObsidianVaultAdapter(this.app);
    const today = new Date().toISOString().slice(0, 10);
    const element = createElement(SanctumApp, {
      adapter,
      today,
      displayUnit: this.plugin.settings.displayUnit,
      onBack: () => {
        void this.plugin.returnToAltar(this.leaf);
      },
      reloadNonce: this.nonce,
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
