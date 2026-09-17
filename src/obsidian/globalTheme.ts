// Global Obsidian theming — injected while the Exercitium plugin is enabled.
//
// Obsidian's UI chrome (file explorer, command palette, settings, tab bar,
// status bar, etc.) consumes a set of documented CSS custom properties at
// `body` level: `--background-primary`, `--text-normal`, `--interactive-accent`
// and so on. Override them there and the entire app retheme "for free" —
// we don't have to restyle each widget individually.
//
// This string is injected into `document.head` as a single `<style>` element
// on plugin load, and removed on unload. That means the grimdark theme is
// active exactly when the plugin is enabled; toggling the plugin off restores
// the user's normal Obsidian look.
//
// Only values that propagate through Obsidian's own variables live here.
// Plugin-specific component styles (view roots, buttons, etc.) stay in
// styles.css so they can be developed and hot-reloaded independently.

export const GLOBAL_THEME_STYLE_ID = "exercitium-global-theme";

// Fonts — loaded globally so Obsidian's interface can use them, not just
// our views. The @import must be the first thing in the stylesheet or
// browsers ignore it.
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Epilogue:wght@400;600;700;800;900&family=Newsreader:ital,wght@0,400;0,600;1,400&family=Space+Grotesk:wght@400;500;600;700&display=swap');`;

// The Gothic Industrialism palette (from the locked Phase 7 design system).
// Duplicated here intentionally rather than imported from styles.css — this
// file needs to stand alone so it can be read and injected at runtime.
const PALETTE = {
  surface: "#131313",
  surfaceLowest: "#0e0e0e",
  surfaceLow: "#1c1b1b",
  surfaceContainer: "#201f1f",
  surfaceHigh: "#2a2a2a",
  surfaceHighest: "#353534",
  blood: "#800020",
  bloodHot: "#a63247",
  gold: "#f7bd48",
  goldDim: "#ba880f",
  onSurface: "#e5e2e1",
  onSurfaceMuted: "#a78a8a",
  onSurfaceFaint: "#584141",
  parchment: "#c8c8b0",
};

// The CSS body. Keeping this in a single template literal rather than
// assembling it programmatically so it's easy to read, diff, and tweak
// without a build step.
export const GLOBAL_THEME_CSS = `
${FONT_IMPORT}

/* Core Obsidian CSS variable overrides. These are the variables Obsidian's
   built-in themes use, documented in the Obsidian CSS guide. Overriding them
   at body scope cascades through almost every piece of app chrome. */
body.exercitium-theme-active {
  /* Backgrounds — layered in the same stacking order as the plugin surfaces
     so the file explorer, modal, and sidebar depths read correctly. */
  --background-primary: ${PALETTE.surface};
  --background-primary-alt: ${PALETTE.surfaceLow};
  --background-secondary: ${PALETTE.surfaceContainer};
  --background-secondary-alt: ${PALETTE.surfaceHigh};
  --background-modifier-border: ${PALETTE.onSurfaceFaint};
  --background-modifier-border-hover: ${PALETTE.goldDim};
  --background-modifier-border-focus: ${PALETTE.gold};
  --background-modifier-hover: ${PALETTE.surfaceHigh};
  --background-modifier-active-hover: ${PALETTE.surfaceHighest};
  --background-modifier-form-field: ${PALETTE.surfaceLowest};
  --background-modifier-error: ${PALETTE.blood};
  --background-modifier-success: ${PALETTE.gold};

  /* Text. "Normal" is the body text; "muted" is secondary labels; "faint"
     is for disabled/placeholder. Accent is the colored link/highlight color
     Obsidian uses for active nav items. */
  --text-normal: ${PALETTE.onSurface};
  --text-muted: ${PALETTE.onSurfaceMuted};
  --text-faint: ${PALETTE.onSurfaceFaint};
  --text-accent: ${PALETTE.gold};
  --text-accent-hover: ${PALETTE.bloodHot};
  --text-on-accent: ${PALETTE.surfaceLowest};
  --text-error: ${PALETTE.bloodHot};
  --text-success: ${PALETTE.gold};
  --text-selection: rgba(128, 0, 32, 0.45);
  --text-highlight-bg: rgba(247, 189, 72, 0.25);

  /* Interactive elements — Obsidian buttons, toggles, and "accent" controls
     all ride these. Primary = blood (action); normal = neutral surface. */
  --interactive-normal: ${PALETTE.surfaceHigh};
  --interactive-hover: ${PALETTE.surfaceHighest};
  --interactive-accent: ${PALETTE.blood};
  --interactive-accent-hover: ${PALETTE.bloodHot};

  /* Fonts. Interface = everything chrome-y (menus, sidebar, settings).
     Text = editor/Markdown body. Monospace = code / frontmatter / data. */
  --font-interface: "Epilogue", "Trajan Pro", "Arial Black", sans-serif;
  --font-text: "Newsreader", Georgia, serif;
  --font-monospace: "Space Grotesk", "JetBrains Mono", monospace;

  /* Heading weight/tracking — Obsidian exposes per-heading variables, so we
     unify them toward the display typography used inside plugin views. */
  --h1-weight: 800;
  --h2-weight: 800;
  --h3-weight: 700;
  --h4-weight: 700;
  --h5-weight: 700;
  --h6-weight: 700;
  --h1-color: ${PALETTE.gold};
  --h2-color: ${PALETTE.gold};
  --h3-color: ${PALETTE.gold};
  --h4-color: ${PALETTE.gold};
  --h5-color: ${PALETTE.gold};
  --h6-color: ${PALETTE.gold};

  /* Scrollbars. Obsidian variables for these exist — no need to hand-roll. */
  --scrollbar-bg: ${PALETTE.surface};
  --scrollbar-thumb-bg: ${PALETTE.surfaceHigh};
  --scrollbar-active-thumb-bg: ${PALETTE.goldDim};

  /* Titlebar / frame — the app's own chrome above the workspace on desktop. */
  --titlebar-background: ${PALETTE.surfaceLowest};
  --titlebar-background-focused: ${PALETTE.surface};
  --titlebar-text-color: ${PALETTE.onSurface};
  --titlebar-text-color-focused: ${PALETTE.gold};

  /* Ribbon (left icon rail). */
  --ribbon-background: ${PALETTE.surfaceLowest};
  --ribbon-background-collapsed: ${PALETTE.surfaceLowest};

  /* Tab header (the row above the content area). */
  --tab-background-active: ${PALETTE.surface};
  --tab-text-color: ${PALETTE.onSurfaceMuted};
  --tab-text-color-focused: ${PALETTE.gold};
  --tab-text-color-focused-active: ${PALETTE.gold};
  --tab-text-color-focused-active-current: ${PALETTE.gold};

  /* Status bar across the bottom. */
  --status-bar-background: ${PALETTE.surfaceLowest};
  --status-bar-text-color: ${PALETTE.onSurfaceMuted};

  /* Input fields — used by the quick switcher, command palette, settings. */
  --input-background: ${PALETTE.surfaceLowest};
  --input-border-color: ${PALETTE.onSurfaceFaint};

  /* Modal dialogs (settings, community plugins, etc.). */
  --modal-background: ${PALETTE.surface};
  --modal-border-color: ${PALETTE.onSurfaceFaint};

  /* Link color in rendered Markdown. */
  --link-color: ${PALETTE.gold};
  --link-color-hover: ${PALETTE.bloodHot};

  /* Checkboxes / radio. */
  --checkbox-color: ${PALETTE.blood};
  --checkbox-color-hover: ${PALETTE.bloodHot};
  --checkbox-border-color: ${PALETTE.onSurfaceFaint};
  --checkbox-border-color-hover: ${PALETTE.gold};

  /* Divider color — Obsidian uses this for the split handles and table grid. */
  --divider-color: ${PALETTE.onSurfaceFaint};
  --divider-color-hover: ${PALETTE.goldDim};

  /* Obsidian's rounded-corner default — zero it out to match plugin rules. */
  --radius-s: 0px;
  --radius-m: 0px;
  --radius-l: 0px;
}

/* Remove rounded corners across Obsidian's own UI while the theme is active.
   This is aggressive on purpose — the locked design rules forbid roundness
   anywhere in the app, not just inside plugin views. */
body.exercitium-theme-active .workspace,
body.exercitium-theme-active .workspace *,
body.exercitium-theme-active .modal,
body.exercitium-theme-active .modal *,
body.exercitium-theme-active .suggestion-container,
body.exercitium-theme-active .suggestion-container *,
body.exercitium-theme-active .menu,
body.exercitium-theme-active .menu * {
  border-radius: 0 !important;
}

/* Headings inside notes pick up the gold Epilogue look — for consistency
   with the in-plugin views. Users browsing Markdown files will feel the
   same Imperial typography. */
body.exercitium-theme-active .markdown-rendered h1,
body.exercitium-theme-active .markdown-rendered h2,
body.exercitium-theme-active .markdown-rendered h3,
body.exercitium-theme-active .markdown-rendered h4,
body.exercitium-theme-active .markdown-rendered h5,
body.exercitium-theme-active .markdown-rendered h6,
body.exercitium-theme-active .cm-header {
  font-family: "Epilogue", "Trajan Pro", "Arial Black", sans-serif !important;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${PALETTE.gold} !important;
}

/* Active tab gets a thin blood underline instead of the default accent bar. */
body.exercitium-theme-active .workspace-tab-header.is-active::after {
  background-color: ${PALETTE.blood} !important;
}

/* Selection glow on list items / suggestions. */
body.exercitium-theme-active .suggestion-item.is-selected,
body.exercitium-theme-active .nav-file-title.is-active,
body.exercitium-theme-active .nav-folder-title.is-active {
  background-color: ${PALETTE.surfaceHigh} !important;
  color: ${PALETTE.gold} !important;
}
`;

/**
 * Inject the global theme CSS into document.head. Idempotent — calling twice
 * does not create duplicate <style> elements. The caller is responsible for
 * calling `removeGlobalTheme` on plugin unload.
 */
export function injectGlobalTheme(): void {
  if (document.getElementById(GLOBAL_THEME_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = GLOBAL_THEME_STYLE_ID;
  style.textContent = GLOBAL_THEME_CSS;
  document.head.appendChild(style);

  // The body class is what our cascade keys on. Separate from the plugin's
  // existing `exercitium-active` class (which tracks whether an Exercitium
  // view is focused). This one stays on for the entire plugin lifecycle.
  document.body.classList.add("exercitium-theme-active");
}

/** Remove the injected theme. Safe to call even if nothing was injected. */
export function removeGlobalTheme(): void {
  document.getElementById(GLOBAL_THEME_STYLE_ID)?.remove();
  document.body.classList.remove("exercitium-theme-active");
}
