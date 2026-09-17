// Exercitium Imperatoris build script.
//
// We do NOT emit main.js into this folder. Obsidian loads plugins from
// <vault>/.obsidian/plugins/<plugin-id>/, so we emit the bundle directly
// into the dev vault. Malte can then click "Reload" in Obsidian's
// community-plugins panel (or use the Hot-Reload community plugin) to
// pick up a new build.
//
// Run `npm run dev` for watch mode during development.
// Run `npm run build` to produce a minified production bundle.

import esbuild from "esbuild";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import builtins from "builtin-modules";

// Resolve paths relative to THIS file, not the invocation CWD.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prod = process.argv[2] === "production";

// Target: <repo-root>/ExercitiumTest/.obsidian/plugins/exercitium-imperatoris/
// The plugin source folder sits next to ExercitiumTest/, so we walk up one level.
const OUT_DIR = path.resolve(
  __dirname,
  "..",
  "ExercitiumTest",
  ".obsidian",
  "plugins",
  "exercitium-imperatoris"
);

fs.mkdirSync(OUT_DIR, { recursive: true });

// manifest.json and styles.css are static — copy them on every build so
// the vault always has the latest versions alongside main.js.
function copyStatic() {
  fs.copyFileSync(
    path.join(__dirname, "manifest.json"),
    path.join(OUT_DIR, "manifest.json")
  );
  const stylesSrc = path.join(__dirname, "styles.css");
  if (fs.existsSync(stylesSrc)) {
    fs.copyFileSync(stylesSrc, path.join(OUT_DIR, "styles.css"));
  }
}
copyStatic();

// Everything listed here is provided by Obsidian at runtime — esbuild must
// NOT inline it into the bundle or Obsidian will load two copies.
const external = [
  "obsidian",
  "electron",
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
  "@lezer/lr",
  ...builtins,
];

const context = await esbuild.context({
  entryPoints: [path.join(__dirname, "src", "main.ts")],
  bundle: true,
  external,
  format: "cjs",
  target: "es2022",
  // Use React 17+ automatic JSX runtime so .tsx files don't need to
  // `import React from "react"` at the top of every file.
  jsx: "automatic",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
  outfile: path.join(OUT_DIR, "main.js"),
  plugins: [
    {
      name: "exercitium-copy-static",
      setup(build) {
        // Re-copy manifest/styles after each incremental rebuild.
        build.onEnd(() => copyStatic());
      },
    },
  ],
});

if (prod) {
  await context.rebuild();
  await context.dispose();
  console.log(`[Exercitium] Production build written to ${OUT_DIR}`);
} else {
  await context.watch();
  console.log(`[Exercitium] Watching for changes. Output → ${OUT_DIR}`);
}
