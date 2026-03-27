# DB Schema

This document records the application database shape.

## Current State

- No Supabase schema, migrations, or generated types are present in the repository yet.
- No application tables are defined yet.

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
