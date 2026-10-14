# Timezone Override Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, selectable JavaScript time-zone override for HTTP(S) sites in Chrome and Vivaldi without the debugger banner.

**Architecture:** A Manifest V3 service worker registers a `MAIN`-world user script at `document_start` with the selected IANA zone embedded in its code source. A popup saves settings and reports API availability. The page shim uses IANA rules to replace default `Date` and `Intl` local-time behavior while preserving UTC and explicit time-zone behavior.

**Tech Stack:** Plain JavaScript, Chrome Extensions MV3, `chrome.userScripts`, `chrome.storage.local`, Node 22 built-in test runner; no production dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-timezone-extension-design.md`

## Global Constraints

- Target Chrome 138+ and the installed Vivaldi build; verify each browser directly.
- Use no `chrome.debugger`, network service, or remote code.
- Apply to HTTP(S) pages and matching frames; leave workers and browser-internal pages out of scope.
- Preserve UTC APIs, timestamps, and explicit `Intl` time-zone options.
- A zone change must persist and affect future loads; open tabs receive immediate injection and an optional manual reload.
- The override starts disabled until the user selects a valid IANA zone.

## Review Focus

1. DST overlap/gap: `resolveLocal` must choose the earlier overlap instant and advance a skipped time by the gap (Task 1 tests).
2. Invalid dates and invalid zones: native invalid-date results stay invalid; an unknown zone is rejected without changing the saved choice (Tasks 2 and 3 tests).
3. Explicit `Intl` options and ISO date-only strings: neither may inherit the override (Task 2 tests).
4. User Scripts toggle off or API missing: the popup must show setup guidance and preserve the chosen zone (Tasks 3 and 4 tests).
5. Restricted tabs and one failed injection: the worker must continue applying the override to other eligible tabs (Task 3 test).

## File map

- `src/zone-math.js`: pure epoch/local-field conversion using native `Intl`; publishes `getWallParts(epochMs, zone)` and `resolveLocal(parts, zone)` on `Symbol.for('chromeTZ.zoneMath')` for the page shim.
- `src/timezone-shim.js`: idempotent page-side `Date`/`Intl` override and restoration. Reads `{mode, timeZone}` from `globalThis.__chromeTZPayload` and keeps native references under `Symbol.for('chromeTZ.state')`.
- `src/background.js`: settings validation, script registration, injection into open tabs, and popup message handling.
- `src/popup.html`, `src/popup.css`, `src/popup.js`: zone search, toggle, status, and manual reload UI.
- `manifest.json`, `package.json`: extension metadata and `npm test` command.
- `tests/zone-math.test.js`, `tests/timezone-shim.test.js`, `tests/background.test.js`, `tests/popup.test.js`: behavior tests with Node and mocked extension APIs.
- `tests/smoke.html`, `tests/smoke-frame.html`, `tests/serve-smoke.mjs`, `README.md`: two-origin browser check pages, local server, and installation, verification, and limitation instructions.

---

### Task 1: IANA time-zone conversion

**Files:** Create `src/zone-math.js`, `tests/zone-math.test.js`, `package.json`.

**Interfaces:** Produce `getWallParts(epochMs: number, zone: string): {year, month, day, hour, minute, second, millisecond, offsetMinutes}` and `resolveLocal(parts, zone): number`. `offsetMinutes` follows `Date#getTimezoneOffset` sign convention. Use the native `Intl.DateTimeFormat` captured when the module loads.

- [ ] **Step 1: Write failing tests** for New York's 2024 DST gap (`02:30` becomes `07:30Z`), overlap (`01:30` becomes `05:30Z`), and Kolkata's `-330` minute offset. Assert the exact epoch milliseconds and returned fields.
- [ ] **Step 2: Run** `node --test tests/zone-math.test.js`; expect failures from the missing module.
- [ ] **Step 3: Implement the two functions** in `src/zone-math.js`; use `formatToParts` for IANA wall fields, search valid offset candidates around transitions, and follow ECMAScript gap/overlap disambiguation.
- [ ] **Step 4: Run** `node --test tests/zone-math.test.js`; expect all tests to pass. Add `package.json` with `"test": "node --test"` and run `npm test`.
- [ ] **Step 5: Commit** with `git add package.json src/zone-math.js tests/zone-math.test.js` and `git commit -m "feat: add IANA timezone conversion"`.

### Task 2: Page-side Date and Intl shim

**Files:** Create `src/timezone-shim.js`, `tests/timezone-shim.test.js`.

**Interfaces:** Consume the Task 1 symbol and `globalThis.__chromeTZPayload` (`{mode:'apply', timeZone:string}` or `{mode:'restore'}`). Running the shim again updates the zone without stacking wrappers.

- [ ] **Step 1: Write failing VM tests**: `Date#getTimezoneOffset`, local getters/setters and constructor, `Date.parse('2024-03-10T02:30:00')`, `Date.parse('2024-03-10')`, `Date#toString`/`toDateString`/`toTimeString`/`toLocaleString`, default and explicit `Intl.DateTimeFormat`, `Date.now`, invalid dates, zone change, and restoration. Assert exact New York and UTC values where fixed.
- [ ] **Step 2: Run** `node --test tests/timezone-shim.test.js`; expect failures because the shim is absent.
- [ ] **Step 3: Implement** an idempotent override in `src/timezone-shim.js`. Preserve native constructor/static properties and UTC methods; use Task 1 for local fields, local setters, and ISO date-time strings without offsets. Keep explicit `Intl` options unchanged and pass the selected zone to local locale-formatting calls.
- [ ] **Step 4: Run** `node --test tests/timezone-shim.test.js`; expect all tests to pass, then run `npm test`.
- [ ] **Step 5: Commit** with `git add src/timezone-shim.js tests/timezone-shim.test.js` and `git commit -m "feat: override page timezone APIs"`.

### Task 3: Persistent extension registration

**Files:** Create `manifest.json`, `src/background.js`, `tests/background.test.js`.

**Interfaces:** Popup messages: `{type:'getStatus'}`, `{type:'setSettings', enabled:boolean, timeZone:string}`, `{type:'reloadTabs'}`. Replies return `{ok:boolean, enabled, timeZone, userScriptsAvailable, error?}`. Persist the same `enabled` and `timeZone` keys in `chrome.storage.local`.

- [ ] **Step 1: Write failing mocked-API tests** for initial disabled state, valid/invalid zone changes, `userScripts` unavailable, install/startup reconciliation, script registration/update/unregister, HTTP(S) tab filtering, one failed tab injection, and manual reload.
- [ ] **Step 2: Run** `node --test tests/background.test.js`; expect failures from the missing worker.
- [ ] **Step 3: Implement** the MV3 manifest and worker. Register one script with code source setting `__chromeTZPayload`, then `src/zone-math.js` and `src/timezone-shim.js` file sources; use `world:'MAIN'`, `runAt:'document_start'`, and `allFrames:true`. Reconcile from storage on install/startup and serialize setting changes. Return actionable errors to the popup.
- [ ] **Step 4: Run** `node --test tests/background.test.js` and `npm test`; expect all tests to pass.
- [ ] **Step 5: Commit** with `git add manifest.json src/background.js tests/background.test.js` and `git commit -m "feat: persist and register timezone override"`.

### Task 4: Popup controls

**Files:** Create `src/popup.html`, `src/popup.css`, `src/popup.js`, `tests/popup.test.js`.

**Interfaces:** Use Task 3 messages. Build the zone list from `Intl.supportedValuesOf('timeZone')` plus `UTC`; selecting a zone enables the override. The reload button sends `reloadTabs` only on user action.

- [ ] **Step 1: Write failing DOM tests** using a minimal fake `document` and `chrome.runtime.sendMessage` in Node for zone filtering/selection, saved-state rendering, off/on behavior, successful and failed settings responses, unavailable-API guidance, and reload click. Assert visible text and messages sent.
- [ ] **Step 2: Run** `node --test tests/popup.test.js`; expect failures from missing UI files.
- [ ] **Step 3: Implement** the compact popup, accessible labels/status text, and message handling. Show the Vivaldi/Chrome extension-details toggle instruction when `userScriptsAvailable` is false.
- [ ] **Step 4: Run** `node --test tests/popup.test.js` and `npm test`; expect all tests to pass.
- [ ] **Step 5: Commit** with `git add src/popup.html src/popup.css src/popup.js tests/popup.test.js` and `git commit -m "feat: add timezone selection popup"`.

### Task 5: Browser verification and usage guide

**Files:** Create `tests/smoke.html`, `README.md`; modify implementation files only for failures confirmed by the browser checks.

**Interfaces:** `tests/serve-smoke.mjs` serves the parent page on `127.0.0.1:8765` and the child frame on `127.0.0.1:8766`. The smoke pages report early-script `Date`/`Intl` values across these two origins via `postMessage`; they do not depend on extension APIs.

- [ ] **Step 1: Add the local server and smoke pages** with assertions for `resolvedOptions().timeZone`, `getTimezoneOffset`, local fields, explicit UTC formatting, and the cross-origin frame.
- [ ] **Step 2: Load the unpacked extension** in installed Chrome and Vivaldi. Enable Allow User Scripts, choose `America/New_York`, run the smoke page, switch to `Asia/Kolkata`, reload, then disable. Record exact results for both browsers; fix any observed failure with a failing automated test first.
- [ ] **Step 3: Write `README.md`** with load-unpacked steps, toggle setup, `npm test`, manual smoke steps, supported scope, and known limitations.
- [ ] **Step 4: Run** `npm test`, `node --check src/zone-math.js`, `node --check src/timezone-shim.js`, `node --check src/background.js`, and `node --check src/popup.js`; expect exit code 0 for each. Check `git status --short` and review the full diff.
- [ ] **Step 5: Commit** with `git add README.md tests/smoke.html tests/smoke-frame.html tests/serve-smoke.mjs` plus any verified fixes and `git commit -m "docs: verify Chrome and Vivaldi installation"`.
