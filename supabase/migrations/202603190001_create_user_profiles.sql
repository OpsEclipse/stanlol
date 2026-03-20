create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_profiles_email_not_blank check (char_length(btrim(email)) > 0),
  constraint user_profiles_display_name_not_blank check (
    display_name is null or char_length(btrim(display_name)) > 0
  )
);

create unique index user_profiles_email_key on public.user_profiles (lower(email));

alter table public.user_profiles enable row level security;

create function public.set_user_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_user_profiles_updated_at();

create policy "Users can insert their own profile"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "Users can view their own profile"
on public.user_profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users can update their own profile"
on public.user_profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
