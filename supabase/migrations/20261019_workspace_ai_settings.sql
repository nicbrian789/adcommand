-- Workspace AI provider settings (BYOK: OpenAI / Anthropic).
-- Apply manually to staging/production. Ciphertext only — never store plaintext API keys.
-- Authenticated clients have no direct table access; app reads/writes via service role after membership checks.

create table if not exists public.workspace_ai_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  provider text not null
    check (provider in ('openai', 'anthropic')),
  api_key_ciphertext text not null,
  api_key_hint text,
  model text,
  base_url text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists workspace_ai_settings_updated_at_idx
  on public.workspace_ai_settings (updated_at desc);

alter table public.workspace_ai_settings enable row level security;

-- Intentionally no policies for authenticated/anon: deny direct client access.
-- Service role (used only from server actions after Owner/member checks) bypasses RLS.

comment on table public.workspace_ai_settings is
  'Encrypted AI provider keys per workspace. Read/write only via server with service role.';
