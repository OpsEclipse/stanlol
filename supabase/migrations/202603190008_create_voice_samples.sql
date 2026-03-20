create table public.voice_samples (
  id uuid primary key default gen_random_uuid(),
  voice_profile_id uuid not null references public.voice_profiles (id) on delete cascade,
  source text not null,
  content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint voice_samples_source_valid check (source in ('manual', 'linkedin')),
  constraint voice_samples_content_not_blank check (char_length(btrim(content)) > 0)
);

create index voice_samples_voice_profile_id_created_at_idx
on public.voice_samples (voice_profile_id, created_at desc);

alter table public.voice_samples enable row level security;

create policy "Users can view own voice samples"
on public.voice_samples
for select
to authenticated
using (
  exists (
    select 1
    from public.voice_profiles
    where voice_profiles.id = voice_profile_id
      and voice_profiles.user_id = auth.uid()
  )
);

create policy "Users can insert own voice samples"
on public.voice_samples
for insert
to authenticated
with check (
  exists (
    select 1
    from public.voice_profiles
    where voice_profiles.id = voice_profile_id
      and voice_profiles.user_id = auth.uid()
  )
);
