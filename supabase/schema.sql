-- Calender: minimal private calendar schema.
-- Run in Supabase SQL Editor before enabling cloud features.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1200),
  start_at timestamptz not null,
  end_at timestamptz not null,
  color text not null default 'red' check (color in ('red', 'green', 'blue', 'yellow', 'purple')),
  reminder_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_end_after_start check (end_at > start_at)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  due_at timestamptz,
  completed boolean not null default false,
  color text not null default 'green' check (color in ('red', 'green', 'blue', 'yellow', 'purple')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) between 20 and 2048),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscription_endpoint_matches check (subscription->>'endpoint' = endpoint)
);

create index if not exists events_user_start_idx on public.events (user_id, start_at);
create index if not exists events_due_reminders_idx on public.events (reminder_at)
  where reminder_at is not null and reminder_sent_at is null;
create index if not exists tasks_user_created_idx on public.tasks (user_id, created_at desc);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.tasks enable row level security;
alter table public.push_subscriptions enable row level security;

-- Remove only the named policies so this script can safely be re-run.
drop policy if exists "Users can read their own events" on public.events;
drop policy if exists "Users can insert their own events" on public.events;
drop policy if exists "Users can update their own events" on public.events;
drop policy if exists "Users can delete their own events" on public.events;

create policy "Users can read their own events" on public.events
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own events" on public.events
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own events" on public.events
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own events" on public.events
for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own tasks" on public.tasks;
drop policy if exists "Users can insert their own tasks" on public.tasks;
drop policy if exists "Users can update their own tasks" on public.tasks;
drop policy if exists "Users can delete their own tasks" on public.tasks;

create policy "Users can read their own tasks" on public.tasks
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own tasks" on public.tasks
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own tasks" on public.tasks
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own tasks" on public.tasks
for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can insert their own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can update their own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can delete their own push subscriptions" on public.push_subscriptions;

create policy "Users can read their own push subscriptions" on public.push_subscriptions
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own push subscriptions" on public.push_subscriptions
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own push subscriptions" on public.push_subscriptions
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own push subscriptions" on public.push_subscriptions
for delete to authenticated using ((select auth.uid()) = user_id);

-- Do not enable anonymous table access. The service-role key belongs only in trusted server functions.


-- Enable live cross-device refresh for calendar and task changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
      execute 'alter publication supabase_realtime add table public.events';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
      execute 'alter publication supabase_realtime add table public.tasks';
    end if;
  end if;
end;
$$;
