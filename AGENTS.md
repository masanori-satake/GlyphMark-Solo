# AGENTS.md — GlyphMark-Solo

Conventions for working on this repository (Solo series common rules apply).

- Vanilla JS + VS Code API only. No build step, zero runtime dependencies.
- 100% local: git history and file stats only. No network, no tracking/telemetry, ever.
- Marks are FileDecoration badges only: never replace file icons (icon themes are the user's choice) and never return a decoration colour (the single colour slot belongs to Git/problem decorations).
- Core logic lives in `src/core.js` with no VS Code dependency and is unit-tested with `node --test`. VS Code glue stays in `src/extension.js`; the assignment form is `media/manager.js` / `media/manager.css`.
- Any change to a file included in the package requires a version bump (minor for features, patch for fixes), keeping package.json, package-lock.json and CHANGELOG.md in sync (`npm run check-version`). CHANGELOG entries are English bullets followed by a Japanese summary.
- package.nls.json / package.nls.ja.json are minified single-line JSON with sorted keys; package.json is 2-space indent.
- Settings namespace is `glyphMark.*`. The assignment form and settings JSON read/write the same `glyphMark.marks` array; catalog order is the priority order.
