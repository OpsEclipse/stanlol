# Progress Notes

## 2026-03-19

- Added project scaffold files: `init.sh`, `feature-list.json`, `progress-notes.md`, `ARCHITECTURE.md`, `src/`, and `tests/`.
- Preserved the existing `AGENTS.md` as the sole agent-instructions file.
- Updated `init.sh` to the requested bootstrap flow and aligned `feature-list.json` to use a `features` array.
- Split durable system constraints into `docs/ARCHITECTURE.md` and moved agent workflow/completion rules into `AGENTS.md`.
- Added the `docs/` reference set: `DB_SCHEMA.md`, `AGENTS_GUIDE.md`, `UI_GUIDE.md`, `API_CONTRACT.md`, and `TECH_DEBT.md`.
- Added a tracked `components/` directory and updated the docs to stop describing it as missing.
- Commit review blocked: `init.sh` now requires `npm test -- --passWithNoTests`, but `package.json` still has no `test` script, so the mandated clean-environment check fails.
- Fixed the clean-environment blocker by adding an `npm test` script with Node's built-in test runner and aligning `init.sh` to use it.
- Replaced the placeholder backlog with a PRD-derived `feature-list.json` containing 235 atomic, dependency-aware implementation features across auth, workspace, chat, drafts, voices, imports, uploads, APIs, and QA.
✓ Feature #F003 Create Supabase database wrapper — done
