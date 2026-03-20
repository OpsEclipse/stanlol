# API Contract

This document records every API route and its request and response shape.

## Current State

- `POST /api/dev/auto-login` exists for local seeded-account development sign-in.

## Route Contract Rules

- All API routes must live in `app/api/`.
- Every route must validate input before processing.
- Every route must return JSON in the shape `{ success: boolean, data?: unknown, error?: string }`.
- Use `try`/`catch` in handlers and shared service functions.

## Documentation Format

For each route, document:

- Route path
- HTTP method
- Input shape
- Validation rules
- Success response
- Error response
- Auth requirements
- Side effects

## Routes

### `POST /api/dev/auto-login`

- Route path: `/api/dev/auto-login`
- HTTP method: `POST`
- Input shape: empty JSON object or no body
- Validation rules: rejects invalid JSON and unexpected payload fields
- Success response: `{ success: true, data: { user: { id, email, displayName } } }`
- Error response: `{ success: false, error: string }`
- Auth requirements: no prior session; route is restricted to explicit local development auto-login
- Side effects: looks up the seeded local test account, generates and verifies a Supabase magic-link session, syncs the user profile, and sets auth session cookies
