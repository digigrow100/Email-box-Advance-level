-- MailPilot initial schema
create extension if not exists pgcrypto;

create table if not exists public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','custom')),
  email text not null,
  display_name text,
  credential_blob text not null,
  imap_host text,
  imap_port int,
  imap_secure boolean default true,
  smtp_host text,
  smtp_port int,
  smtp_secure boolean default true,
  status text not null default 'healthy' check (status in ('healthy','warning','paused','error')),
  daily_limit int not null default 10 check (daily_limit between 1 and 200),
  ramp_enabled boolean not null default true,
  ramp_day int not null default 1 check (ramp_day >= 1),
  target_daily_limit int not null default 30 check (target_daily_limit between 1 and 200),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  company text,
  status text not null default 'active' check (status in ('active','replied','bounced','unsubscribed')),
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email),
  unique (unsubscribe_token)
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  template_id uuid references public.templates(id) on delete set null,
  name text not null,
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft','scheduled','running','paused','completed')),
  timezone text not null default 'America/New_York',
  send_window_start time not null default '09:00',
  send_window_end time not null default '16:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','sent','failed','replied','skipped')),
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create table if not exists public.message_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid references public.mailboxes(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  campaign_contact_id uuid references public.campaign_contacts(id) on delete set null,
  type text not null check (type in ('sent','reply','bounce','failed','connected','warning','unsubscribed')),
  provider_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists campaign_contacts_due_idx on public.campaign_contacts(status, scheduled_at);
create index if not exists message_events_mailbox_created_idx on public.message_events(mailbox_id, created_at desc);
create index if not exists contacts_user_status_idx on public.contacts(user_id, status);

alter table public.mailboxes enable row level security;
alter table public.contacts enable row level security;
alter table public.templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_contacts enable row level security;
alter table public.message_events enable row level security;

create policy "mailboxes own rows" on public.mailboxes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contacts own rows" on public.contacts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "templates own rows" on public.templates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "campaigns own rows" on public.campaigns for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "campaign contacts through campaign" on public.campaign_contacts for all
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()));
create policy "events own rows" on public.message_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
