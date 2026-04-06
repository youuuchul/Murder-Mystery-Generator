-- Optional recovery email + password reset token storage for maker accounts.
-- Recovery emails live on profiles, while reset tokens are kept in a separate table
-- so editing account profile data and consuming one-time reset links stay isolated.

alter table public.profiles
  add column if not exists recovery_email text;

create table if not exists public.maker_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  requested_email text not null default '',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists maker_password_reset_tokens_user_id_idx
  on public.maker_password_reset_tokens (user_id, created_at desc);

create index if not exists maker_password_reset_tokens_expires_at_idx
  on public.maker_password_reset_tokens (expires_at);

alter table public.maker_password_reset_tokens enable row level security;
