# DB Schema

This document records the application database shape.

## Current State

- Supabase migrations now live under `supabase/migrations/`.
- The application currently defines the `public.user_profiles`, `public.generation_audit_events`, `public.chat_threads`, `public.chat_messages`, `public.drafts`, `public.draft_revisions`, `public.voice_profiles`, and `public.voice_samples` tables.

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

### `public.chat_messages`

- Purpose: persistent ordered conversation turns within each chat thread.
- Primary key: `id uuid` with `gen_random_uuid()` default.
- Columns:
  - `id uuid`
  - `thread_id uuid`
  - `role text`
  - `content text`
  - `position integer`
  - `created_at timestamptz`
- Constraints:
  - `thread_id` references `public.chat_threads(id)` with `on delete cascade`.
  - `role` is limited to `user` or `assistant`.
  - `chat_messages_content_not_blank` prevents blank message bodies.
  - `chat_messages_position_positive` requires a positive per-thread position.
  - `chat_messages_thread_id_position_key` enforces unique ordering within each thread.
- Indexes:
  - `chat_messages_thread_id_position_idx` on `thread_id, position`.
  - `chat_messages_thread_id_created_at_idx` on `thread_id, created_at asc`.
- Row-level security:
  - Authenticated users can `select` only messages whose parent thread belongs to them.
  - Authenticated users can `insert` only messages whose parent thread belongs to them.
- Relationships:
  - Each chat message belongs to one `public.chat_threads` record through `thread_id`.

### `public.drafts`

- Purpose: persistent active LinkedIn draft storage for each chat thread.
- Primary key: `id uuid` with `gen_random_uuid()` default.
- Columns:
  - `id uuid`
  - `thread_id uuid`
  - `content text`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- Constraints:
  - `thread_id` references `public.chat_threads(id)` with `on delete cascade`.
  - `drafts_content_not_blank` prevents blank draft bodies.
  - `drafts_thread_id_key` enforces one active draft per thread.
- Indexes:
  - `drafts_thread_id_key` unique index on `thread_id`.
- Row-level security:
  - Authenticated users can `select`, `insert`, and `update` only drafts whose parent thread belongs to them.
- Relationships:
  - Each draft belongs to one `public.chat_threads` record through `thread_id`.

### `public.draft_revisions`

- Purpose: immutable revision history for each persisted draft.
- Primary key: `id uuid` with `gen_random_uuid()` default.
- Columns:
  - `id uuid`
  - `draft_id uuid`
  - `revision_number integer`
  - `content text`
  - `created_at timestamptz`
- Constraints:
  - `draft_id` references `public.drafts(id)` with `on delete cascade`.
  - `draft_revisions_revision_number_positive` requires a positive revision number.
  - `draft_revisions_content_not_blank` prevents blank revision content.
  - `draft_revisions_draft_id_revision_number_key` enforces one revision number per draft.
- Row-level security:
  - Authenticated users can `select` only revisions whose parent draft belongs to one of their threads.
  - Authenticated users can `insert` only revisions whose parent draft belongs to one of their threads.
- Relationships:
  - Each draft revision belongs to one `public.drafts` record through `draft_id`.

### `public.voice_profiles`

- Purpose: persistent reusable writing voices owned by a single authenticated user.
- Primary key: `id uuid` with `gen_random_uuid()` default.
- Columns:
  - `id uuid`
  - `user_id uuid`
  - `name text`
  - `description text | null`
  - `instructions text`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- Constraints:
  - `user_id` references `auth.users(id)` with `on delete cascade`.
  - `voice_profiles_name_not_blank` prevents blank voice names.
  - `voice_profiles_description_not_blank` prevents blank descriptions when present.
  - `voice_profiles_instructions_not_blank` prevents blank voice instructions.
- Indexes:
  - `voice_profiles_user_id_updated_at_idx` on `user_id, updated_at desc`.
- Row-level security:
  - Authenticated users can `select`, `insert`, `update`, and `delete` only their own rows where `auth.uid() = user_id`.
- Relationships:
  - Each voice profile belongs to one `auth.users` record through `user_id`.

### `public.voice_samples`

- Purpose: persistent imported writing examples used to enrich a reusable voice profile.
- Primary key: `id uuid` with `gen_random_uuid()` default.
- Columns:
  - `id uuid`
  - `voice_profile_id uuid`
  - `source text`
  - `content text`
  - `created_at timestamptz`
- Constraints:
  - `voice_profile_id` references `public.voice_profiles(id)` with `on delete cascade`.
  - `source` is limited to `manual` or `linkedin`.
  - `voice_samples_content_not_blank` prevents blank sample text.
- Indexes:
  - `voice_samples_voice_profile_id_created_at_idx` on `voice_profile_id, created_at desc`.
- Row-level security:
  - Authenticated users can `select` only samples whose parent voice profile belongs to them.
  - Authenticated users can `insert` only samples whose parent voice profile belongs to them.
- Relationships:
  - Each voice sample belongs to one `public.voice_profiles` record through `voice_profile_id`.

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
