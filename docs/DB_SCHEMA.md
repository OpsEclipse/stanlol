# DB Schema

This document records the application database shape.

## Current State

- Supabase migrations now live under `supabase/migrations/`.
- The application currently defines the `public.user_profiles`, `public.generation_audit_events`, and `public.chat_threads` tables.

## Tables

### `public.user_profiles`

- Purpose: persistent account-level metadata for each authenticated user.
- Primary key: `id uuid` referencing `auth.users(id)` with `on delete cascade`.
- Columns:
  - `id uuid`
  - `email text`
  - `display_name text | null`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- Constraints:
  - `user_profiles_email_not_blank` prevents blank emails.
  - `user_profiles_display_name_not_blank` prevents blank display names when present.
- Indexes:
  - `user_profiles_email_key` unique index on `lower(email)` for case-insensitive uniqueness.
- Row-level security:
  - Authenticated users can `select`, `insert`, and `update` only their own row where `auth.uid() = id`.
- Relationships:
  - Each `user_profiles` row belongs to exactly one `auth.users` record.

### `public.generation_audit_events`

- Purpose: per-generation audit records for debugging, reliability analysis, and product insight.
- Primary key: `id uuid` with `gen_random_uuid()` default.
- Columns:
  - `id uuid`
  - `user_id uuid`
  - `thread_id uuid | null`
  - `draft_id uuid | null`
  - `voice_id uuid | null`
  - `outcome text`
  - `revision_reason text | null`
  - `model_identifier text | null`
  - `generation_latency_ms integer | null`
  - `error_message text | null`
  - `metadata jsonb`
  - `created_at timestamptz`
- Constraints:
  - `user_id` references `auth.users(id)` with `on delete cascade`.
  - `outcome` is limited to `success` or `failure`.
  - `generation_latency_ms` must be non-negative when present.
- Indexes:
  - `generation_audit_events_user_id_created_at_idx` on `user_id, created_at desc`.
  - `generation_audit_events_thread_id_created_at_idx` on `thread_id, created_at desc` where `thread_id is not null`.
  - `generation_audit_events_outcome_created_at_idx` on `outcome, created_at desc`.
- Row-level security:
  - Authenticated users can `select` only their own rows where `auth.uid() = user_id`.
  - Authenticated users can `insert` only their own rows where `auth.uid() = user_id`.
- Relationships:
  - Each audit event belongs to one `auth.users` record through `user_id`.
  - Thread, draft, and voice identifiers are stored as nullable UUID references until those tables exist.

### `public.chat_threads`

- Purpose: persistent user-owned conversation containers for chat history and draft context.
- Primary key: `id uuid` with `gen_random_uuid()` default.
- Columns:
  - `id uuid`
  - `user_id uuid`
  - `title text | null`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- Constraints:
  - `user_id` references `auth.users(id)` with `on delete cascade`.
  - `chat_threads_title_not_blank` prevents blank titles when present.
- Indexes:
  - `chat_threads_user_id_updated_at_idx` on `user_id, updated_at desc`.
- Row-level security:
  - Authenticated users can `select`, `insert`, and `update` only their own rows where `auth.uid() = user_id`.
- Relationships:
  - Each chat thread belongs to one `auth.users` record through `user_id`.

## Documentation Contract

When database work begins, document the following here:

- Table names
- Column names and types
- Primary keys
- Foreign keys
- Indexes and unique constraints
- Row-level security expectations
- Relationships between tables

## Ownership

- All schema changes belong in `supabase/migrations/`.
- All runtime database access belongs in `lib/db.ts`.
