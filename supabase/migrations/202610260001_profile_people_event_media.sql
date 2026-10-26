-- Calender profile, contacts, visit history, event location/photos and private Storage.
-- Apply this migration to an existing Calender Supabase project after supabase/schema.sql.

alter table public.events
  add column if not exists location text not null default '' check (char_length(location) <= 500),
  add column if not exists all_day boolean not null default false,
  add column if not exists photo_paths text[] not null default '{}'::text[];

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  phone text not null default '' check (char_length(phone) <= 40),
  birthday date,
  bio text not null default '' check (char_length(bio) <= 1000),
  avatar_url text not null default '' check (char_length(avatar_url) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  relationship text not null default '' check (char_length(relationship) <= 100),
  email text not null default '' check (char_length(email) <= 254),
  phone text not null default '' check (char_length(phone) <= 40),
  notes text not null default '' check (char_length(notes) <= 1500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visit_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  visited_at timestamptz not null default now(),
  notes text not null default '' check (char_length(notes) <= 1500),
  created_at timestamptz not null default now()
);

create index if not exists people_user_name_idx on public.people (user_id, name);
create index if not exists visit_history_user_date_idx on public.visit_history (user_id, visited_at desc);
create index if not exists visit_history_person_date_idx on public.visit_history (person_id, visited_at desc);

create or replace function public.calender_set_updated_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.calender_set_updated_at();

drop trigger if exists people_set_updated_at on public.people;
create trigger people_set_updated_at before update on public.people
for each row execute function public.calender_set_updated_at();

create or replace function public.calender_create_profile_for_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists calender_auth_user_profile on auth.users;
create trigger calender_auth_user_profile after insert on auth.users
for each row execute function public.calender_create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.visit_history enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own people" on public.people;
drop policy if exists "Users can insert their own people" on public.people;
drop policy if exists "Users can update their own people" on public.people;
drop policy if exists "Users can delete their own people" on public.people;
create policy "Users can read their own people" on public.people
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own people" on public.people
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own people" on public.people
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own people" on public.people
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own visit history" on public.visit_history;
drop policy if exists "Users can insert their own visit history" on public.visit_history;
drop policy if exists "Users can update their own visit history" on public.visit_history;
drop policy if exists "Users can delete their own visit history" on public.visit_history;
create policy "Users can read their own visit history" on public.visit_history
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own visit history" on public.visit_history
  for insert to authenticated with check (
    (select auth.uid()) = user_id and
    (person_id is null or exists (
      select 1 from public.people p where p.id = person_id and p.user_id = (select auth.uid())
    ))
  );
create policy "Users can update their own visit history" on public.visit_history
  for update to authenticated using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id and
    (person_id is null or exists (
      select 1 from public.people p where p.id = person_id and p.user_id = (select auth.uid())
    ))
  );
create policy "Users can delete their own visit history" on public.visit_history
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.profiles, public.people, public.visit_history from anon;
grant select, insert, update, delete on table public.profiles, public.people, public.visit_history to authenticated;
grant all on table public.profiles, public.people, public.visit_history to service_role;

-- Private storage: paths are owner_uuid/event_uuid/generated_filename.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-photos', 'event-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Users can read their own event photos" on storage.objects;
drop policy if exists "Users can upload their own event photos" on storage.objects;
drop policy if exists "Users can update their own event photos" on storage.objects;
drop policy if exists "Users can delete their own event photos" on storage.objects;
create policy "Users can read their own event photos" on storage.objects for select to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can upload their own event photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can update their own event photos" on storage.objects for update to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can delete their own event photos" on storage.objects for delete to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Keep realtime refresh available for these account-scoped data tables.
do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['profiles', 'people', 'visit_history'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
