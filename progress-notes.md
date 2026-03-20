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
✓ Feature #F038 Add local test-account seeding lookup — done
✓ Feature #F018 Create generation audit event table — done
✓ Feature #F022 Create user profile fetch helper — done
✓ Feature #F024 Add Google OAuth sign-in screen — done
✓ Feature #F061 Create chat threads migration — done
✓ Feature #F039 Add dev auto-login environment gate — done
✓ Feature #F023 Sync profile on first sign-in — done
✓ Feature #F019 Create generation audit logging service — done
✓ Feature #F026 Add auth callback handler — done
✓ Feature #F134 Log generation success audit events — done
✓ Feature #F040 Add preview and production auto-login deny behavior — done
✓ Feature #F064 Create thread creation service — done
✓ Feature #F062 Create chat messages migration — done
✓ Feature #F135 Log generation failure audit events — done
✓ Feature #F091 Create drafts migration — done
✓ Feature #F067 Create thread list query — done
✓ Feature #F207 Implement GET /api/chat/threads route — done
Blocked Feature #F094 Create draft fetch helper — implementation added in `lib/draft-fetch.ts`, but `npm test` still fails after 3 attempts because the pre-existing `tests/app/api-dev-auto-login-route.test.mjs` fixture cannot compile `app/api/dev/auto-login/route.ts` and its auth-session dependencies.
✓ Feature #F085 Show thread timestamp in history — done
Blocked Feature #F092 Create draft revisions migration — implementation added in `supabase/migrations/202603190006_create_draft_revisions.sql` with `tests/supabase/draft-revisions-migration.test.mjs`, but `npm test` still fails after 3 attempts because the pre-existing route-fixture suites cannot compile `app/api/chat/threads/route.ts` and the dev auto-login fixture still fails resolving `next/server`.
✓ Feature #F136 Store model identifier in audit events — done
✓ Feature #F228 Add API route error logging — done
✓ Feature #F220 Implement POST /api/dev/auto-login route — done
✓ Feature #F137 Store generation latency in audit events — done
✓ Feature #F235 Add dev auto-login environment gate tests — done
✓ Feature #F141 Create voice profiles migration — done
✓ Feature #F142 Create voice samples migration — done
✓ Feature #F066 Persist placeholder thread title — done
✓ Feature #F206 Implement POST /api/chat/threads route — done
✓ Feature #F144 Create voice fetch and list helper — done
✓ Feature #F138 Store revision reason in audit events — done
✓ Feature #F176 Persist manual import batch record — done
✓ Feature #F143 Add voice ownership enforcement — done
✓ Feature #F063 Add thread ownership enforcement — done
✓ Feature #F210 Implement GET /api/voices route — done
