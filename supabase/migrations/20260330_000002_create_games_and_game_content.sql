-- Create Supabase-backed game persistence tables.
-- This migration keeps library metadata (`games`) separate from full editor JSON (`game_content`)
-- so current GamePackage-centric editing can move without immediate heavy normalization.

create table if not exists public.games (
  id uuid primary key,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  summary text,
  difficulty text not null,
  player_count integer not null,
  estimated_duration integer not null,
  cover_asset_id uuid,
  visibility text not null default 'private' check (visibility in ('draft', 'private', 'public')),
  lifecycle_status text not null default 'draft' check (lifecycle_status in ('draft', 'ready', 'archived')),
  tags text[] not null default '{}',
  clue_count integer not null default 0,
  location_count integer not null default 0,
  round_count integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_editor_id uuid references public.profiles (id) on delete set null
);

create table if not exists public.game_content (
  game_id uuid primary key references public.games (id) on delete cascade,
  content_json jsonb not null,
  schema_version integer not null default 1,
  migrated_from_local boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists games_owner_id_idx on public.games (owner_id);
create index if not exists games_visibility_updated_at_idx on public.games (visibility, updated_at desc);
create index if not exists games_updated_at_idx on public.games (updated_at desc);

create or replace function public.set_games_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_games_updated_at on public.games;

create trigger set_games_updated_at
before update on public.games
for each row
execute function public.set_games_updated_at();

create or replace function public.set_game_content_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_game_content_updated_at on public.game_content;

create trigger set_game_content_updated_at
before update on public.game_content
for each row
execute function public.set_game_content_updated_at();

alter table public.games enable row level security;
alter table public.game_content enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'games'
      and policyname = 'games_select_public_or_owner'
  ) then
    create policy games_select_public_or_owner
      on public.games
      for select
      using (visibility = 'public' or auth.uid() = owner_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'games'
      and policyname = 'games_insert_owner'
  ) then
    create policy games_insert_owner
      on public.games
      for insert
      with check (auth.uid() = owner_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'games'
      and policyname = 'games_update_owner'
  ) then
    create policy games_update_owner
      on public.games
      for update
      using (auth.uid() = owner_id)
      with check (auth.uid() = owner_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'games'
      and policyname = 'games_delete_owner'
  ) then
    create policy games_delete_owner
      on public.games
      for delete
      using (auth.uid() = owner_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'game_content'
      and policyname = 'game_content_select_public_or_owner'
  ) then
    create policy game_content_select_public_or_owner
      on public.game_content
      for select
      using (
        exists (
          select 1
          from public.games
          where games.id = game_content.game_id
            and (games.visibility = 'public' or games.owner_id = auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'game_content'
      and policyname = 'game_content_insert_owner'
  ) then
    create policy game_content_insert_owner
      on public.game_content
      for insert
      with check (
        exists (
          select 1
          from public.games
          where games.id = game_content.game_id
            and games.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'game_content'
      and policyname = 'game_content_update_owner'
  ) then
    create policy game_content_update_owner
      on public.game_content
      for update
      using (
        exists (
          select 1
          from public.games
          where games.id = game_content.game_id
            and games.owner_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.games
          where games.id = game_content.game_id
            and games.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'game_content'
      and policyname = 'game_content_delete_owner'
  ) then
    create policy game_content_delete_owner
      on public.game_content
      for delete
      using (
        exists (
          select 1
          from public.games
          where games.id = game_content.game_id
            and games.owner_id = auth.uid()
        )
      );
  end if;
end
$$;
