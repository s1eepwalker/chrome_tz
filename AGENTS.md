# Repository Guidelines

## Project Structure & Module Organization

Apart from this guide, the directory has no application code, test suite, asset directory, or project manifest. When adding the first implementation, keep source files in `src/`, automated tests in `tests/`, and static files in `assets/` if needed. Mirror source paths in test names where practical, and document any new top-level directory in a `README.md`.

## Build, Test, and Development Commands

No build, run, lint, or test commands are configured yet. Add the relevant manifest and scripts with the first code change, then document the exact setup and verification commands in `README.md`. For a Node-based project, for example, expose `npm run dev`, `npm test`, and `npm run build` through `package.json`; do not assume those commands work until the scripts exist.

## Coding Style & Naming Conventions

There is no established language or formatter. Choose one formatter and lint configuration when introducing source code, commit their configuration, and format changed files before review. Use descriptive file names that match the language ecosystem; for JavaScript, `src/time-zone-picker.js` and `tests/time-zone-picker.test.js` illustrate a consistent pattern. Keep functions focused and avoid adding generated files to source directories.

## Testing Guidelines

No test framework or coverage threshold exists yet. Add tests alongside the first feature and include a regression test with each bug fix. Name tests for the behavior they verify, keep fixtures small, and record the test command in the project manifest and `README.md`. Run the full available test suite before opening a pull request.

## Commit & Pull Request Guidelines

This directory has no Git history, so there is no existing commit convention to follow. Use short, imperative subjects such as `Add initial project scaffold`. Pull requests should explain the change, link related issues when available, list commands run and their results, and include screenshots for visible UI changes.

## Security & Configuration

Keep credentials and local configuration out of version control. If configuration becomes necessary, provide a safe example file and document required variables in `README.md`.
