// The Altar — the plugin's home view.
//
// Thin Obsidian adapter over the React AltarApp (same pattern as RitualView):
//   1. Declares the view type / icon / title for Obsidian.
//   2. Mounts the React root on open.
//   3. Unmounts on close.
//   4. Exposes an `onBeginRitual` callback that opens the Ritual leaf.
//   5. Threads the user's display unit (kg vs lb) into the React app and
//      lets it flip the unit through a callback that round-trips to the
//      plugin's saved settings.

import { ItemView, WorkspaceLeaf } from "obsidian";
import { createElement } from "react";
import { mountReact, type ReactMountHandle } from "../obsidian/reactMount";
import { ObsidianVaultAdapter } from "../obsidian/ObsidianVaultAdapter";
import { AltarApp } from "../react/AltarApp";
import type ExercitiumPlugin from "../main";
import type { DisplayUnit } from "../domain/units";

export const ALTAR_VIEW_TYPE = "exercitium-altar";

export class AltarView extends ItemView {
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
    return ALTAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "The Altar";
  }

  getIcon(): string {
    return "skull";
  }

  async onOpen(): Promise<void> {
    this.renderApp();
    // The Altar is what you land on after finishing a Ritual, so it is the
    // view most likely to be showing figures from before the session was
    // saved. Re-render on refocus to pick the new session up.
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
    const element = createElement(AltarApp, {
      adapter,
      today,
      displayUnit: this.plugin.settings.displayUnit,
      rotationOrder: this.plugin.settings.rotationOrder,
      onDisplayUnitChange: async (unit: DisplayUnit) => {
        await this.plugin.setDisplayUnit(unit);
      },
      onBeginRitual: () => {
        void this.plugin.openRitual();
      },
      onBeginCardio: () => {
        void this.plugin.openRitual("cardio_only");
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
