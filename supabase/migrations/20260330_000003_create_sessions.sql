-- Create Supabase-backed session persistence.
-- This phase keeps session mutation simple by storing the canonical GameSession
-- as JSONB while still exposing summary columns for list/join queries.

create table if not exists public.sessions (
  id uuid primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  session_code text not null unique,
  host_user_id uuid references public.profiles (id) on delete set null,
  phase text not null,
  current_round integer not null default 0,
  current_sub_phase text,
  locked_player_count integer not null default 0,
  total_player_count integer not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  session_json jsonb not null
);

create index if not exists sessions_game_id_ended_at_idx
  on public.sessions (game_id, ended_at, created_at desc);
create index if not exists sessions_session_code_idx
  on public.sessions (session_code);
create index if not exists sessions_updated_at_idx
  on public.sessions (updated_at desc);

create or replace function public.set_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_sessions_updated_at on public.sessions;

create trigger set_sessions_updated_at
before update on public.sessions
for each row
execute function public.set_sessions_updated_at();

alter table public.sessions enable row level security;
