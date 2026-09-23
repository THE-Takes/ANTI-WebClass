# Source layout

Chrome extension entry points are intentionally small. Feature code is grouped by execution context:

- `home/`: dashboard state, timetable, messages, ToDo UI, and course-name behavior
- `course/`: downloads, material pages, exam layouts/frames, media, and course contents
- `background/`: storage/update helpers, TickTick sync, course-name APIs, and downloads
- `options/`: settings helpers, persistence, integrations, and navigation

`home.js`, `course.js`, `background.js`, and `options.js` only wire up initialization and browser events.

## Loading contract

These are classic scripts rather than ES modules, because manifest content scripts and the current service worker share dependencies through their execution context. Order is therefore part of the interface:

- Home and course scripts are ordered in `manifest.json`.
- Background scripts are ordered in `background.js` via `importScripts()`.
- Options scripts are ordered at the end of `options.html`.
- Entry-point files must remain last.
- Bindings used by another manifest content-script file must be declared with
  `function` or `var`; Chrome injects each file separately, so top-level
  `const` and `let` bindings are not shared with later files.

When adding or moving a module, update the corresponding order list in `scripts/validate-extension.mjs` and the source aggregation in `scripts/security-regression-check.mjs`.

Run `npm run check` after changing source layout or dependencies.
