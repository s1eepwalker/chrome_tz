# Repository Guidelines

## Project Structure & Module Organization

This is an unpacked Manifest V3 extension; `manifest.json` is its entry point. `src/background.js` stores settings and registers the early user script. `src/zone-math.js` converts IANA time zones, `src/timezone-shim.js` overrides page `Date` and `Intl` behavior, and `src/popup.*` implements the Russian-language controls. Automated tests and the local two-origin smoke pages live in `tests/`. Design and implementation notes are in `docs/superpowers/`.

## Build, Test, and Development Commands

- `npm test` runs all Node.js tests; use Node.js 22 or newer.
- `node tests/serve-smoke.mjs` serves the smoke page on port 8765 and its cross-origin frame on port 8766. Load the repository as an unpacked extension, select a zone, then visit `http://127.0.0.1:8765/?zone=America/New_York` and check `allPass: true`.
- `node --check src/background.js` checks JavaScript syntax; repeat for other changed scripts. `git diff --check` checks patch whitespace.

There is no bundling step or production dependency installation. Chromium loads the files directly from this directory.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, single quotes in JavaScript, and descriptive camelCase names for functions and variables. Keep source file names in kebab-case, such as `zone-math.js`; name matching tests `zone-math.test.js`. Follow the existing style when editing HTML and CSS. No formatter or linter is configured; run the syntax and whitespace checks above before review.

## Testing Guidelines

Tests use Node.js `node:test` and `assert/strict`, with isolated VM contexts for page and service-worker code. Add behavior-focused regression tests for changes to date parsing, daylight-saving transitions, script registration, or popup state. There is no numeric coverage threshold. Run `npm test` and, for injection changes, verify both the main smoke page and cross-origin frame in Chrome and Vivaldi.

## Commit & Pull Request Guidelines

Recent commits use short Conventional Commit subjects such as `feat: add timezone selection popup` and `docs: verify Chrome and Vivaldi installation`. Keep that pattern. A pull request should explain the user-visible effect, link a related issue when one exists, list verification results, and include a popup screenshot for UI changes.

## Security & Configuration

Keep the `userScripts` and HTTP(S) permissions aligned with the feature. Never commit browser profiles, credentials, or generated test artifacts. Users must enable **Allow User Scripts** for the extension in their browser settings.
