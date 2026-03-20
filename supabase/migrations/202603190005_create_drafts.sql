create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint drafts_content_not_blank check (char_length(btrim(content)) > 0),
  constraint drafts_thread_id_key unique (thread_id)
);

alter table public.drafts enable row level security;

create function public.set_drafts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger set_drafts_updated_at
before update on public.drafts
for each row
execute function public.set_drafts_updated_at();

create policy "Users can view own drafts"
on public.drafts
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_threads
    where chat_threads.id = thread_id
      and chat_threads.user_id = auth.uid()
  )
);

create policy "Users can insert own drafts"
on public.drafts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.chat_threads
    where chat_threads.id = thread_id
      and chat_threads.user_id = auth.uid()
  )
);

create policy "Users can update own drafts"
on public.drafts
for update
to authenticated
using (
  exists (
    select 1
    from public.chat_threads
    where chat_threads.id = thread_id
      and chat_threads.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.chat_threads
    where chat_threads.id = thread_id
      and chat_threads.user_id = auth.uid()
  )
);
