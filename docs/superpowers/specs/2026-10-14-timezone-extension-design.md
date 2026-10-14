# Timezone Override Extension — Design

## Goal and scope

Build a local Manifest V3 extension for Chrome and Vivaldi that continuously presents one user-selected IANA time zone to JavaScript running on HTTP(S) websites. The setting applies to new tabs and frames and persists across browser restarts. The user can change the zone or disable the override from the extension popup. The extension must not use `chrome.debugger` or display its debugging banner.

The first version targets Chromium browsers that expose `chrome.userScripts` with `MAIN` world and `document_start` injection. Chrome 138+ is the baseline; Vivaldi compatibility is verified in its installed build rather than inferred from Chromium alone. Users may need to enable **Allow User Scripts** on the extension details page.

## Approach and components

- `manifest.json` declares a popup, a service worker, `storage`, `userScripts`, and `tabs` permissions, plus HTTP(S) host access. No network service or remote code is required.
- The popup provides a searchable list of IANA zone identifiers, an on/off control, current status, and a way to reload affected tabs. The override starts disabled until a zone is selected. The popup validates a selected zone with `Intl.DateTimeFormat` before saving it to `chrome.storage.local`.
- The service worker owns one registered user script. It embeds the selected zone as a JSON string in the script's code source, followed by a packaged shim file, and registers it for all HTTP(S) pages at `document_start`, in `MAIN` world, with `allFrames: true`. It reconciles registration on install, extension update, startup, and setting changes; extension updates clear registered scripts, so the setting in storage remains authoritative.
- On a setting change, the worker updates registration and executes the same shim in accessible open tabs. This changes future API calls on those pages immediately. The popup offers manual reload because a site may have cached time values before the change. Disabling unregisters the script and asks open pages to restore original APIs; a reload is offered for full reset.

## Page-side behavior

The shim saves native `Date` and `Intl.DateTimeFormat` references once per page and is safe to run again with a different zone. It preserves timestamps, `Date.now()`, `Date.UTC()`, UTC getters/setters, and explicit `Intl.DateTimeFormat` `timeZone` options. It changes the default `Intl.DateTimeFormat` zone and `resolvedOptions().timeZone`; local `Date` getters/setters, `getTimezoneOffset()`, local-field construction, ISO date-time parsing without an explicit offset, and local string/locale formatting use the chosen zone. Date-only ISO strings remain UTC as required by JavaScript. For daylight-saving overlaps, local construction chooses the earlier instant; for gaps, it advances by the gap duration, following [ECMAScript Date semantics](https://tc39.es/ecma262/multipage/numbers-and-dates.html). A disabled setting restores the captured native APIs where possible.

This is a JavaScript API override, not a change to the browser engine's system time zone. It does not alter IP geolocation, server-side time, HTTP headers, Web Workers, internal browser pages, or scripts that retain native references or previously computed values. Some sandboxed or non-HTTP(S) frames may be outside injection scope. The extension does not promise resistance to fingerprinting or deliberate tampering by a page.

## Errors and verification

If `chrome.userScripts` is unavailable or its per-extension toggle is off, the popup shows the required setup step and leaves the saved choice intact. Registration, injection, and permission failures are surfaced in the popup; unsupported tabs are skipped without blocking other tabs.

Use focused Node tests for time-zone conversion, daylight-saving boundaries, parsing, and restoration. Use a local test page to check `Date`/`Intl` before page scripts run, in nested HTTP(S) frames, after zone changes, after reload, and after disabling. Load the unpacked extension into installed Chrome and Vivaldi builds and repeat the browser checks in both. Document installation, the toggle, limitations, and test commands in `README.md`.
