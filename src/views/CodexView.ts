// The Codex Imperialis view — Obsidian ItemView that hosts the six
// charts (Burden of the Flesh, Hibernation, Encumbrance Lifted Off the
// Soul, Astartes Aspiration, Days of Glory, Week of Praise).
//
// Same mount/unmount pattern as Altar, Sanctum, Ritual: build the adapter,
// stamp today's date, hand everything to the React app.

import { ItemView, WorkspaceLeaf } from "obsidian";
import { createElement } from "react";
import { mountReact, type ReactMountHandle } from "../obsidian/reactMount";
import { ObsidianVaultAdapter } from "../obsidian/ObsidianVaultAdapter";
import { CodexApp } from "../react/CodexApp";
import type ExercitiumPlugin from "../main";

export const CODEX_VIEW_TYPE = "exercitium-codex";

export class CodexView extends ItemView {
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
    return CODEX_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Codex Imperialis";
  }

  getIcon(): string {
    // Lucide icon: book with a bookmark — reads as a codex. Phase 7 will
    // swap in a custom gothic SVG for the ribbon entry.
    return "book-marked";
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
    const element = createElement(CodexApp, {
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
