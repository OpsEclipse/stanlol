create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint chat_threads_title_not_blank check (
    title is null or char_length(btrim(title)) > 0
  )
);

create index chat_threads_user_id_updated_at_idx
on public.chat_threads (user_id, updated_at desc);

alter table public.chat_threads enable row level security;

create function public.set_chat_threads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger set_chat_threads_updated_at
before update on public.chat_threads
for each row
execute function public.set_chat_threads_updated_at();

create policy "Users can insert own chat threads"
on public.chat_threads
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can view own chat threads"
on public.chat_threads
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can update own chat threads"
on public.chat_threads
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
