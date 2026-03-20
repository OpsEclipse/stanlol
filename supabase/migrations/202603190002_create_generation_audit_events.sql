create table public.generation_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid,
  draft_id uuid,
  voice_id uuid,
  outcome text not null check (outcome in ('success', 'failure')),
  revision_reason text,
  model_identifier text,
  generation_latency_ms integer check (generation_latency_ms is null or generation_latency_ms >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index generation_audit_events_user_id_created_at_idx
on public.generation_audit_events (user_id, created_at desc);

create index generation_audit_events_thread_id_created_at_idx
on public.generation_audit_events (thread_id, created_at desc)
where thread_id is not null;

create index generation_audit_events_outcome_created_at_idx
on public.generation_audit_events (outcome, created_at desc);

alter table public.generation_audit_events enable row level security;

create policy "Users can view own generation audit events"
on public.generation_audit_events
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own generation audit events"
on public.generation_audit_events
for insert
to authenticated
with check (auth.uid() = user_id);
