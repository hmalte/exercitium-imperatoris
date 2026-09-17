# Exercitium Imperatoris

_A grimdark, personal-use Obsidian plugin for tracking lifts. In nomine Imperatoris._

> **Status**: v0.1.0 — Phase 8 complete. Full strength-tracking loop, grimdark theme, mobile-ready. Not intended for the Obsidian community store.

## What it does

Four custom Obsidian views, themed after 40k Imperial Gothic:

- **The Altar** — home view. Shows current rotation slot, streak, deload countdown, and the "Begin the Ritual" button. Quotes rotate daily. Declare a Leave of Absence from here.
- **The Ritual** — active-workout flow. Sleep intake → exercise menu for the current slot → set-by-set logging with double-progression suggestions → cardio finisher (slot-aware default modality + minutes) → bodyweight weigh-out → save.
- **The Sanctum** — body heatmap + MEV/MAV/MRV volume landmarks per muscle, per time window. Click a muscle to see its recent sets.
- **The Codex Imperialis** — the stats view. Recharts-powered panels for bodyweight, sleep, 1RM progression, training volume, streak ribbon, and deload / Cardio Week timeline.

All workout data is plain markdown + YAML in `sessions/`, `loas/`, `exercises/`, and `quotes/` under the vault root. Nothing is hidden — you can hand-edit any file, or view everything through Obsidian's Bases.

**One tap → no chrome.** The "Enter the Ritual Chamber" command collapses both sidebars and opens the Altar. While any Exercitium view is focused, the plugin hides Obsidian's tab header, status bar, and mobile navbar. Pin that command to the mobile toolbar and you land on a chrome-free grimdark canvas from the Android home screen.

## Repository layout

```
exercitium-imperatoris/
  src/
    main.ts                          ← plugin entry: views, commands, global theme, settings tab
    views/                           ← thin Obsidian ItemView adapters (Altar / Ritual / Sanctum / Codex)
    react/                           ← the actual UIs — one React root per view
      codex/                         ← individual Codex panels (one file per chart)
    obsidian/
      ObsidianVaultAdapter.ts        ← VaultAdapter impl wrapping Obsidian's API
      SettingsTab.ts                 ← PluginSettingTab (LoA, Cardio Week, re-seed, purge)
      globalTheme.ts                 ← injected <style> that themes all of Obsidian while the plugin is enabled
      reactMount.ts                  ← shared React 18 mount/unmount helper for ItemViews
    domain/                          ← all pure logic — no Obsidian imports
      schemas.ts, frontmatter.ts     ← type-safe SessionFile / ExerciseFile / LoAFile shapes + YAML I/O
      vault.ts                       ← CRUD on top of the VaultAdapter interface
      timeLogic.ts                   ← streak, deload counter, Cardio Week trigger
      progression.ts, volume.ts      ← double-progression suggestions, tonnage/volume math
      stats.ts, landmarks.ts         ← Codex data shaping, MEV/MAV/MRV defaults
      seed.ts                        ← idempotent seeder for default exercises + quote pools
    seed/                            ← raw data (45 exercise defaults, 50+50 quotes)
  styles.css                         ← plugin-scoped grimdark styles
  manifest.json                      ← Obsidian plugin manifest (isDesktopOnly: false)
  versions.json                      ← per-version minAppVersion map (Obsidian convention)
  esbuild.config.mjs                 ← bundler; emits straight into the dev vault
  tsconfig.json
  vitest.config.ts
  package.json
```

Builds emit to `../ExercitiumTest/.obsidian/plugins/exercitium-imperatoris/`.

## Development workflow

### First-time setup

```bash
cd exercitium-imperatoris
npm install
```

Recharts and react-redux must resolve to the same React copy the plugin uses — npm's default install does the right thing here; don't hoist these dependencies up to the workspace root.

### Dev loop (desktop)

```bash
npm run dev
```

esbuild runs in watch mode. Every save re-bundles `main.js` into the dev vault.

Inside Obsidian:

1. Open the `ExercitiumTest` vault.
2. Settings → Community plugins → turn on community plugins (once).
3. Find **Exercitium Imperatoris** → toggle on.
4. Click the skull ribbon icon (or run **Exercitium: Open the Altar** from the command palette).

After any code change, reload the plugin:

- **Manual**: Settings → Community plugins → toggle the plugin off then on.
- **Faster**: install the community plugin **Hot-Reload** (by pjeby). It watches the plugins folder and reloads automatically on rebuild.

### Production build

```bash
npm run build
```

Runs `tsc --noEmit` for type safety, then produces a minified bundle.

### Tests

```bash
npm test           # run once
npm run test:watch
```

131 unit tests cover the date-math, progression, volume, stats, and frontmatter round-trip paths. No UI tests — the views are exercised manually via desktop + Android.

## Installing on Android

The mobile install path is **BRAT** (Beta Reviewer's Auto-updater Tool), a community plugin that installs plugins directly from a GitHub repo.

Prereq: push this repo to GitHub (public, or private with a BRAT-authorized token).

On the Android device's Obsidian:

1. Settings → Community plugins → Browse → install **BRAT**.
2. BRAT settings → **Add Beta plugin** → paste the repo URL (e.g. `https://github.com/<user>/exercitium-imperatoris`).
3. Enable **Exercitium Imperatoris** in Community plugins.
4. BRAT's "Check for updates to all beta plugins" pulls future builds.

### Mobile launch config (recommended)

Set up the "one tap from home screen to chrome-free Altar" path:

1. Open Obsidian → Settings → Mobile → **Manage toolbar**.
2. Add **Exercitium: Enter the Ritual Chamber** to the toolbar. Put it in the first slot.
3. (Optional but nice) Also add **Exercitium: Open the Codex Imperialis**, **Open the Sanctum**, **Open the Altar** to the toolbar.
4. Close the settings and drag the toolbar order so Ritual Chamber is the leftmost icon.

From the Android home screen:

- Tap the Obsidian app icon → Obsidian opens the last active file.
- Tap the Ritual Chamber toolbar icon → both sidebars collapse, the Altar opens, and Obsidian's chrome hides. One tap, one screen.

The plugin's **global theme** kicks in automatically whenever it's enabled — the file explorer, command palette, settings modal, and status bar all pick up the Imperial palette. Disabling the plugin restores your normal Obsidian look cleanly.

## Settings tab

Settings → Exercitium Imperatoris exposes:

- **Declare Leave of Absence** — end date + reason. Pauses the streak and deload counter.
- **Trigger Cardio Week** — marks today as a cardio-deload day. The derived Cardio Week range extends as you flag more days.
- **Re-seed exercises & quotes** — idempotent; fills in anything you deleted by accident.
- **Reset plugin state** — nuclear. Type `PURGE` to enable the delete button. Wipes sessions, LoAs, and quotes. The exercise library is left alone.

## License

MIT (personal use). Quotes are original paraphrases in the 40k voice — not lifted verbatim from Games Workshop material.
