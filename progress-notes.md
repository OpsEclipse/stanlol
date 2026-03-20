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
✓ Feature #F004 Create OpenAI wrapper — done
✓ Feature #F003 Create Supabase database wrapper — done
✓ Feature #F007 Create request validation helper — done
✓ Feature #F006 Create JSON response helper — done
✓ Feature #F020 Create analytics event taxonomy — done
✓ Feature #F009 Create app error boundary — done
✓ Feature #F005 Create agent orchestration module — done
✓ Feature #F008 Create authenticated API helper — done
✓ Feature #F016 Create storage asset URL utility — done
Blocked Feature #F017 Create local-only feature flag helper — implementation added in `lib/local-feature-flags.ts`, but test execution is blocked by pre-existing TypeScript ESM module-resolution failures outside the allowed files when running the `.ts` test suite.
✓ Feature #F017 Create local-only feature flag helper — done
✓ Feature #F010 Create loading state primitives — done
✓ Feature #F012 Create toast and feedback system — done
✓ Feature #F011 Create empty state primitives — done
✓ Feature #F037 Add unauthorized API response behavior — done
✓ Feature #F124 Build system prompt from product boundaries — done
✓ Feature #F129 Add explicit agent termination conditions — done
✓ Feature #F133 Create structured generation result contract — done
✓ Feature #F131 Prevent non-product third-party tool calls — done
✓ Feature #F130 Prevent arbitrary long-running agent loops — done
Paused orchestration — only ready features are migration-backed (`F018`, `F021`), and the current repo rules treat migration-file work as a hard stop.
✓ Feature #F021 Create user profiles migration — done
✓ Feature #F018 Create generation audit event table — done
