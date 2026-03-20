## Your First 3 Steps (Always)
1. Read `feature-list.json` — find the next pending task
2. Read `progress-notes.md` — understand what's been done recently
3. Run `init.sh` — confirm the environment is clean

Then and only then, start coding.
---

## Documentation Map
> Only read what you need for the current task. Do not read all docs upfront.

| Topic | File | When to Read |
|---|---|---|
| Architecture rules & folder structure | `/docs/ARCHITECTURE.md` | Before writing any code |
| Database schema & query patterns | `/docs/DB_SCHEMA.md` | Before any DB work |
| AI agent logic & prompt patterns | `/docs/AGENTS_GUIDE.md` | Before touching /lib/agents |
| UI component conventions | `/docs/UI_GUIDE.md` | Before building components |
| API contract & response shapes | `/docs/API_CONTRACT.md` | Before writing API routes |
| Current known bugs & tech debt | `/docs/TECH_DEBT.md` | When fixing bugs |

---

## What "Done" Means
You are DONE with a task when ALL of these are true:
- [ ] Code is written
- [ ] Tests pass (`npm test`)
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] No lint errors (`npm run lint`)
- [ ] `feature-list.json` updated to `"done"`
- [ ] Git commit written with descriptive message
- [ ] One line appended to `progress-notes.md`

---

## Hard Stops
STOP immediately and do NOT proceed if:
- Tests are failing and you cannot fix them in 3 attempts
- You need a secret, API key, or credential you don't have
- You're about to modify `ARCHITECTURE.md`, `AGENTS.md`, or `schema.sql`
- You realize the task requires changing more than 3 files you didn't plan to touch

Leave a note in `progress-notes.md` explaining what blocked you, then stop.

---

## One Task at a Time
Work on exactly ONE feature per session.
Do not start the next task. Do not refactor unrelated code.
Do not "improve" things that aren't broken.
Complete → Test → Commit → Stop.
