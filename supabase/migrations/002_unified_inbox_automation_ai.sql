-- MailPilot unified inbox, scheduling, automation and AI layer

alter table public.mailboxes
  add column if not exists signature text,
  add column if not exists sync_enabled boolean not null default true,
  add column if not exists last_uid bigint;

create table if not exists public.mail_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  external_thread_key text,
  subject text not null default '(no subject)',
  participants jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open','archived','snoozed')),
  unread_count int not null default 0 check (unread_count >= 0),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mail_threads_external_key_idx
  on public.mail_threads(mailbox_id, external_thread_key)
  where external_thread_key is not null;
create index if not exists mail_threads_user_last_idx
  on public.mail_threads(user_id, last_message_at desc);

create table if not exists public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  thread_id uuid not null references public.mail_threads(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  from_email text not null,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  subject text not null default '(no subject)',
  body_text text not null default '',
  body_html text,
  provider_message_id text,
  provider_uid bigint,
  in_reply_to text,
  references_header text,
  is_read boolean not null default false,
  is_ai_generated boolean not null default false,
  sent_at timestamptz,
  received_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists mail_messages_provider_id_idx
  on public.mail_messages(mailbox_id, provider_message_id);
create unique index if not exists mail_messages_uid_idx
  on public.mail_messages(mailbox_id, provider_uid);
create index if not exists mail_messages_thread_created_idx
  on public.mail_messages(thread_id, created_at asc);

create table if not exists public.tone_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  instructions text not null default '',
  example_snippets jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  model text not null default 'gpt-5.6-mini',
  reply_mode text not null default 'draft' check (reply_mode in ('off','draft','auto_send')),
  default_tone_profile_id uuid references public.tone_profiles(id) on delete set null,
  max_auto_replies_per_day int not null default 10 check (max_auto_replies_per_day between 0 and 100),
  auto_reply_delay_minutes int not null default 5 check (auto_reply_delay_minutes between 0 and 1440),
  timezone text not null default 'Asia/Karachi',
  business_hours_start time not null default '09:00',
  business_hours_end time not null default '18:00',
  require_known_contact boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  trigger_type text not null check (trigger_type in ('inbound_email','scheduled','manual')),
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  priority int not null default 100,
  cooldown_minutes int not null default 0 check (cooldown_minutes between 0 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  thread_id uuid references public.mail_threads(id) on delete set null,
  to_emails text[] not null,
  cc_emails text[] not null default '{}',
  subject text not null,
  body_text text not null,
  in_reply_to text,
  references_header text,
  tone_profile_id uuid references public.tone_profiles(id) on delete set null,
  is_ai_generated boolean not null default false,
  status text not null default 'scheduled' check (status in ('draft','scheduled','sending','sent','failed','cancelled')),
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scheduled_messages_due_idx
  on public.scheduled_messages(status, scheduled_at);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete set null,
  mailbox_id uuid references public.mailboxes(id) on delete set null,
  thread_id uuid references public.mail_threads(id) on delete set null,
  message_id uuid references public.mail_messages(id) on delete set null,
  status text not null check (status in ('matched','skipped','drafted','scheduled','sent','failed')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists automation_runs_user_created_idx
  on public.automation_runs(user_id, created_at desc);

alter table public.mail_threads enable row level security;
alter table public.mail_messages enable row level security;
alter table public.tone_profiles enable row level security;
alter table public.ai_settings enable row level security;
alter table public.automation_rules enable row level security;
alter table public.scheduled_messages enable row level security;
alter table public.automation_runs enable row level security;

create policy "threads own rows" on public.mail_threads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "messages own rows" on public.mail_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tone profiles own rows" on public.tone_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai settings own row" on public.ai_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "automation rules own rows" on public.automation_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scheduled messages own rows" on public.scheduled_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "automation runs own rows" on public.automation_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
