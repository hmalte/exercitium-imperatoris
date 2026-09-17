// The real VaultAdapter — wraps Obsidian's vault API.
//
// Nothing in this file is testable in plain Node, because Obsidian isn't
// available outside the app. That's fine: all the hard logic lives behind
// the VaultAdapter interface in src/domain/ and is tested with the in-memory
// adapter. This file's only job is to translate our small API onto Obsidian's.

import { App, TFile, TFolder, normalizePath } from "obsidian";
import type { VaultAdapter } from "../domain/vault";

export class ObsidianVaultAdapter implements VaultAdapter {
  constructor(private app: App) {}

  async exists(path: string): Promise<boolean> {
    return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
  }

  /**
   * Create the folder (and any missing ancestors). Safe to call on a folder
   * that already exists. Throws if a FILE blocks the path.
   */
  async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    const parts = normalized.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing instanceof TFile) {
        throw new Error(
          `Cannot create folder "${current}": a file already exists there.`,
        );
      }
      try {
        await this.app.vault.createFolder(current);
      } catch (e) {
        // Another call may have created it between our check and create.
        // If it exists now, we're good; otherwise rethrow.
        const after = this.app.vault.getAbstractFileByPath(current);
        if (!(after instanceof TFolder)) throw e;
      }
    }
  }

  async listFiles(folder: string): Promise<string[]> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(folder));
    if (!(f instanceof TFolder)) return [];
    return f.children
      .filter((c): c is TFile => c instanceof TFile)
      .map((c) => c.path);
  }

  async readFile(path: string): Promise<string> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(f instanceof TFile)) {
      throw new Error(`ObsidianVaultAdapter: no file at "${path}"`);
    }
    return this.app.vault.read(f);
  }

  async writeFile(path: string, contents: string): Promise<void> {
    const normalized = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, contents);
      return;
    }
    // Make sure the parent folder exists before creating the file.
    const slash = normalized.lastIndexOf("/");
    if (slash > 0) await this.ensureFolder(normalized.slice(0, slash));
    await this.app.vault.create(normalized, contents);
  }

  async deleteFile(path: string): Promise<void> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (f instanceof TFile) {
      await this.app.vault.delete(f);
    }
  }
}
