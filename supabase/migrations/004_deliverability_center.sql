-- MailPilot deliverability, tracking and inbox-placement schema

alter table public.workspace_settings
  add column if not exists open_tracking_enabled boolean not null default false,
  add column if not exists click_tracking_enabled boolean not null default false;

alter table public.message_events drop constraint if exists message_events_type_check;
alter table public.message_events
  add constraint message_events_type_check
  check (type in (
    'sent','reply','bounce','failed','connected','warning','unsubscribed',
    'sync_failed','automation','auto_reply_skipped','health','open','click',
    'complaint','placement','deliverability'
  ));

create table if not exists public.deliverability_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  dkim_selectors text[] not null default array['default','google','selector1','selector2']::text[],
  health_score int not null default 0 check (health_score between 0 and 100),
  spf_status text not null default 'unknown' check (spf_status in ('pass','warning','fail','unknown')),
  dkim_status text not null default 'unknown' check (dkim_status in ('pass','warning','fail','unknown')),
  dmarc_status text not null default 'unknown' check (dmarc_status in ('pass','warning','fail','unknown')),
  mx_status text not null default 'unknown' check (mx_status in ('pass','warning','fail','unknown')),
  last_checked_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, domain)
);

create table if not exists public.deliverability_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain_id uuid references public.deliverability_domains(id) on delete cascade,
  mailbox_id uuid references public.mailboxes(id) on delete cascade,
  check_type text not null check (check_type in ('dns','content','bounce_health','provider_reputation','blocklist','placement')),
  status text not null check (status in ('pass','warning','fail','unknown')),
  score int check (score between 0 and 100),
  summary text not null default '',
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);
create index if not exists deliverability_checks_user_time_idx on public.deliverability_checks(user_id, checked_at desc);

create table if not exists public.seed_inboxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  label text not null,
  provider_hint text not null default 'other' check (provider_hint in ('gmail','outlook','yahoo','custom','other')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, mailbox_id)
);

create table if not exists public.placement_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  marker text not null unique,
  subject text not null,
  status text not null default 'sent' check (status in ('sent','checking','completed','partial','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.placement_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  test_id uuid not null references public.placement_tests(id) on delete cascade,
  seed_inbox_id uuid not null references public.seed_inboxes(id) on delete cascade,
  recipient_email text not null,
  placement text not null default 'unknown' check (placement in ('inbox','spam','other','not_found','unknown')),
  matched_folder text,
  received_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz,
  unique(test_id, seed_inbox_id)
);
create index if not exists placement_results_test_idx on public.placement_results(test_id);

create table if not exists public.message_tracking_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mail_message_id uuid not null references public.mail_messages(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  unique(mail_message_id)
);

create table if not exists public.message_tracking_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tracking_token_id uuid not null references public.message_tracking_tokens(id) on delete cascade,
  event_type text not null check (event_type in ('open','click')),
  target_url text,
  user_agent text,
  ip_hash text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists message_tracking_events_token_time_idx on public.message_tracking_events(tracking_token_id, occurred_at desc);

alter table public.deliverability_domains enable row level security;
alter table public.deliverability_checks enable row level security;
alter table public.seed_inboxes enable row level security;
alter table public.placement_tests enable row level security;
alter table public.placement_results enable row level security;
alter table public.message_tracking_tokens enable row level security;
alter table public.message_tracking_events enable row level security;

create policy "deliverability domains own rows" on public.deliverability_domains for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "deliverability checks own rows" on public.deliverability_checks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "seed inboxes own rows" on public.seed_inboxes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "placement tests own rows" on public.placement_tests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "placement results own rows" on public.placement_results for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tracking tokens own rows" on public.message_tracking_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tracking events own rows" on public.message_tracking_events for select using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.deliverability_domains;
create trigger set_updated_at before update on public.deliverability_domains for each row execute function public.set_updated_at();

create or replace function public.validate_seed_inbox_ownership()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.mailboxes m where m.id = new.mailbox_id and m.user_id = new.user_id) then
    raise exception 'seed inbox mailbox does not belong to user';
  end if;
  return new;
end;
$$;
create trigger validate_seed_inbox_ownership before insert or update on public.seed_inboxes for each row execute function public.validate_seed_inbox_ownership();

create or replace function public.validate_placement_test_ownership()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.mailboxes m where m.id = new.source_mailbox_id and m.user_id = new.user_id) then
    raise exception 'source mailbox does not belong to user';
  end if;
  return new;
end;
$$;
create trigger validate_placement_test_ownership before insert or update on public.placement_tests for each row execute function public.validate_placement_test_ownership();

create or replace function public.validate_placement_result_ownership()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.placement_tests t where t.id = new.test_id and t.user_id = new.user_id) then
    raise exception 'placement test does not belong to user';
  end if;
  if not exists (select 1 from public.seed_inboxes s where s.id = new.seed_inbox_id and s.user_id = new.user_id) then
    raise exception 'seed inbox does not belong to user';
  end if;
  return new;
end;
$$;
create trigger validate_placement_result_ownership before insert or update on public.placement_results for each row execute function public.validate_placement_result_ownership();

create or replace function public.validate_deliverability_check_ownership()
returns trigger language plpgsql as $$
begin
  if new.domain_id is not null and not exists (select 1 from public.deliverability_domains d where d.id = new.domain_id and d.user_id = new.user_id) then
    raise exception 'deliverability domain does not belong to user';
  end if;
  if new.mailbox_id is not null and not exists (select 1 from public.mailboxes m where m.id = new.mailbox_id and m.user_id = new.user_id) then
    raise exception 'deliverability mailbox does not belong to user';
  end if;
  return new;
end;
$$;
create trigger validate_deliverability_check_ownership before insert or update on public.deliverability_checks for each row execute function public.validate_deliverability_check_ownership();

create or replace function public.validate_tracking_token_ownership()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.mail_messages m where m.id = new.mail_message_id and m.user_id = new.user_id) then
    raise exception 'tracked message does not belong to user';
  end if;
  return new;
end;
$$;
create trigger validate_tracking_token_ownership before insert or update on public.message_tracking_tokens for each row execute function public.validate_tracking_token_ownership();

create table if not exists public.provider_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_postmaster')),
  credential_blob text not null,
  account_email text,
  status text not null default 'connected' check (status in ('connected','error','disabled')),
  metadata jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider)
);

create table if not exists public.provider_reputation_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain_id uuid not null references public.deliverability_domains(id) on delete cascade,
  provider text not null check (provider in ('google_postmaster')),
  period_start date,
  period_end date,
  spam_rate double precision,
  delivery_error_rate double precision,
  spf_success_rate double precision,
  dkim_success_rate double precision,
  dmarc_success_rate double precision,
  tls_rate double precision,
  compliance jsonb not null default '{}'::jsonb,
  raw_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists provider_reputation_snapshots_domain_time_idx on public.provider_reputation_snapshots(domain_id, created_at desc);

alter table public.provider_integrations enable row level security;
alter table public.provider_reputation_snapshots enable row level security;
create policy "provider integrations own rows" on public.provider_integrations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "provider reputation own rows" on public.provider_reputation_snapshots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.validate_provider_reputation_ownership()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.deliverability_domains d where d.id = new.domain_id and d.user_id = new.user_id) then
    raise exception 'provider reputation domain does not belong to user';
  end if;
  return new;
end;
$$;
create trigger validate_provider_reputation_ownership before insert or update on public.provider_reputation_snapshots for each row execute function public.validate_provider_reputation_ownership();

drop trigger if exists set_updated_at on public.provider_integrations;
create trigger set_updated_at before update on public.provider_integrations for each row execute function public.set_updated_at();
