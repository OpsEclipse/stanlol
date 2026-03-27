# Architecture Rules

This file defines system boundaries and repository structure.
If a prompt conflicts with this file, this file wins.

## Stack Direction

- Use the Next.js App Router structure under `app/`.
- Use Tailwind CSS for styling.
- Use Supabase for database access and authentication.
- Use OpenAI through repository wrappers, not direct call sites.
- Keep deployment assumptions compatible with Vercel.

## Folder Ownership

- `app/` contains routes, layouts, and page-level composition only.
- `app/api/` is the only location for API routes.
- `components/` contains reusable presentational UI components.
- `lib/` contains shared utilities and service integrations.
- `lib/db.ts` owns Supabase access.
- `lib/ai.ts` owns OpenAI access.
- `lib/agents/` contains agent prompts, orchestration, and termination logic.
- `types/` contains shared TypeScript types.
- `tests/` contains automated tests and should mirror the application structure where practical.

## Hard Rules

### Database

- Never call Supabase directly from a page, route component, or reusable component.
- All database access goes through `lib/db.ts`.
- All schema changes go in `supabase/migrations/`.

### AI and Agents

- Never call the OpenAI API directly from a page, route component, or reusable component.
- All AI calls go through `lib/ai.ts`.
- All agent orchestration lives in `lib/agents/`.
- Agents must always have an explicit termination condition.

### API

- All API routes live in `app/api/` only.
- Every API route must validate input before processing.
- Every API route returns JSON in the shape `{ success: boolean, data?: unknown, error?: string }`.
- Use `async`/`await`, not promise chains, in route handlers.
- Use `try`/`catch` in API routes and shared service functions.

### Components

- Components are presentational only.
- Components must not perform database or AI calls.
- Split components before they become difficult to reason about.

### Styling

- Use Tailwind utility classes for styling.
- Do not add inline styles, CSS modules, or styled-components.
- Do not introduce third-party UI libraries without explicit approval.

### TypeScript

- Keep strict TypeScript enabled.
- Do not use `any`.
- Do not use `// @ts-ignore`.
- Put shared application types in `types/`.

## Consistency Rules

- Use PascalCase for component names.
- Use camelCase for functions and variables.
- Use kebab-case for file names unless framework conventions require otherwise.
- Do not commit secrets, tokens, or machine-specific credentials.
