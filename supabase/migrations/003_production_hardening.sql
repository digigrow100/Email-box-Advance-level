-- MailPilot production hardening
-- Additive migration: do not edit earlier migrations after they have shipped.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Mailbox health, scheduling locks, automation retry state
-- ---------------------------------------------------------------------------

alter table public.mailboxes
  add column if not exists timezone text not null default 'UTC',
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz,
  add column if not exists consecutive_failures int not null default 0 check (consecutive_failures >= 0),
  add column if not exists last_successful_sync_at timestamptz,
  add column if not exists last_successful_send_at timestamptz;

alter table public.scheduled_messages
  add column if not exists attempt_count int not null default 0 check (attempt_count >= 0),
  add column if not exists max_attempts int not null default 3 check (max_attempts between 1 and 20),
  add column if not exists claimed_at timestamptz,
  add column if not exists lock_token uuid;

alter table public.campaign_contacts
  add column if not exists attempt_count int not null default 0 check (attempt_count >= 0),
  add column if not exists max_attempts int not null default 3 check (max_attempts between 1 and 20),
  add column if not exists claimed_at timestamptz,
  add column if not exists lock_token uuid;

alter table public.mail_messages
  add column if not exists automation_claimed_at timestamptz,
  add column if not exists automation_processed_at timestamptz,
  add column if not exists automation_attempt_count int not null default 0 check (automation_attempt_count >= 0),
  add column if not exists automation_last_error text;

-- Do not retroactively auto-reply to messages that existed before this automation worker was deployed.
update public.mail_messages
set automation_processed_at = coalesce(automation_processed_at, now())
where direction = 'inbound';

-- Add an in-progress state for atomic campaign claims.
alter table public.campaign_contacts drop constraint if exists campaign_contacts_status_check;
alter table public.campaign_contacts
  add constraint campaign_contacts_status_check
  check (status in ('queued','sending','sent','failed','replied','skipped'));

-- Broaden event vocabulary for operational diagnostics.
alter table public.message_events drop constraint if exists message_events_type_check;
alter table public.message_events
  add constraint message_events_type_check
  check (type in (
    'sent','reply','bounce','failed','connected','warning','unsubscribed',
    'sync_failed','automation','auto_reply_skipped','health'
  ));

-- Allow complaint suppression if/when a provider webhook is added.
alter table public.contacts drop constraint if exists contacts_status_check;
alter table public.contacts
  add constraint contacts_status_check
  check (status in ('active','replied','bounced','unsubscribed','complained'));

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_type text not null default 'user' check (actor_type in ('user','system','automation')),
  action text not null,
  entity_type text,
  entity_id uuid,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_user_created_idx
  on public.audit_logs(user_id, created_at desc);
create index if not exists audit_logs_entity_idx
  on public.audit_logs(entity_type, entity_id, created_at desc);

alter table public.audit_logs enable row level security;
drop policy if exists "audit logs own rows" on public.audit_logs;
create policy "audit logs own rows" on public.audit_logs
  for select using (auth.uid() = user_id);

-- Users can read their audit log. Inserts are server-side through service role.

-- ---------------------------------------------------------------------------
-- Consistency constraints and indexes
-- ---------------------------------------------------------------------------

-- Keep only one default tone profile per user. Normalize existing duplicates first.
with ranked as (
  select id, row_number() over (partition by user_id order by updated_at desc, created_at desc, id) as rn
  from public.tone_profiles
  where is_default = true
)
update public.tone_profiles t
set is_default = false
from ranked r
where t.id = r.id and r.rn > 1;

create unique index if not exists tone_profiles_one_default_per_user_idx
  on public.tone_profiles(user_id)
  where is_default = true;

create index if not exists scheduled_messages_claim_idx
  on public.scheduled_messages(status, scheduled_at, claimed_at);
create index if not exists campaign_contacts_claim_idx
  on public.campaign_contacts(status, scheduled_at, claimed_at);
create index if not exists mail_messages_automation_idx
  on public.mail_messages(direction, automation_processed_at, automation_claimed_at, created_at)
  where direction = 'inbound';
create index if not exists mailboxes_sync_idx
  on public.mailboxes(sync_enabled, status, last_sync_at)
  where sync_enabled = true;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Recreate triggers safely.
do $$
declare
  t text;
begin
  foreach t in array array['mailboxes','contacts','templates','campaigns','mail_threads','tone_profiles','ai_settings','automation_rules','scheduled_messages']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Ownership validation triggers
-- RLS protects rows by user_id, but foreign keys must also belong to that user.
-- ---------------------------------------------------------------------------

create or replace function public.validate_mail_thread_ownership()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.mailboxes m where m.id = new.mailbox_id and m.user_id = new.user_id) then
    raise exception 'mailbox does not belong to user';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_mail_thread_ownership on public.mail_threads;
create trigger validate_mail_thread_ownership
before insert or update on public.mail_threads
for each row execute function public.validate_mail_thread_ownership();

create or replace function public.validate_mail_message_ownership()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.mailboxes m where m.id = new.mailbox_id and m.user_id = new.user_id) then
    raise exception 'mailbox does not belong to user';
  end if;
  if not exists (select 1 from public.mail_threads t where t.id = new.thread_id and t.user_id = new.user_id and t.mailbox_id = new.mailbox_id) then
    raise exception 'thread does not belong to user/mailbox';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_mail_message_ownership on public.mail_messages;
create trigger validate_mail_message_ownership
before insert or update on public.mail_messages
for each row execute function public.validate_mail_message_ownership();

create or replace function public.validate_campaign_ownership()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.mailboxes m where m.id = new.mailbox_id and m.user_id = new.user_id) then
    raise exception 'campaign mailbox does not belong to user';
  end if;
  if new.template_id is not null and not exists (select 1 from public.templates t where t.id = new.template_id and t.user_id = new.user_id) then
    raise exception 'campaign template does not belong to user';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_campaign_ownership on public.campaigns;
create trigger validate_campaign_ownership
before insert or update on public.campaigns
for each row execute function public.validate_campaign_ownership();

create or replace function public.validate_campaign_contact_ownership()
returns trigger language plpgsql as $$
declare
  campaign_user uuid;
  contact_user uuid;
begin
  select user_id into campaign_user from public.campaigns where id = new.campaign_id;
  select user_id into contact_user from public.contacts where id = new.contact_id;
  if campaign_user is null or contact_user is null or campaign_user <> contact_user then
    raise exception 'campaign and contact must belong to the same user';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_campaign_contact_ownership on public.campaign_contacts;
create trigger validate_campaign_contact_ownership
before insert or update on public.campaign_contacts
for each row execute function public.validate_campaign_contact_ownership();

create or replace function public.validate_scheduled_message_ownership()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.mailboxes m where m.id = new.mailbox_id and m.user_id = new.user_id) then
    raise exception 'scheduled mailbox does not belong to user';
  end if;
  if new.thread_id is not null and not exists (select 1 from public.mail_threads t where t.id = new.thread_id and t.user_id = new.user_id and t.mailbox_id = new.mailbox_id) then
    raise exception 'scheduled thread does not belong to user/mailbox';
  end if;
  if new.tone_profile_id is not null and not exists (select 1 from public.tone_profiles p where p.id = new.tone_profile_id and p.user_id = new.user_id) then
    raise exception 'tone profile does not belong to user';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_scheduled_message_ownership on public.scheduled_messages;
create trigger validate_scheduled_message_ownership
before insert or update on public.scheduled_messages
for each row execute function public.validate_scheduled_message_ownership();

create or replace function public.validate_ai_settings_ownership()
returns trigger language plpgsql as $$
begin
  if new.default_tone_profile_id is not null and not exists (
    select 1 from public.tone_profiles p where p.id = new.default_tone_profile_id and p.user_id = new.user_id
  ) then
    raise exception 'default tone profile does not belong to user';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_ai_settings_ownership on public.ai_settings;
create trigger validate_ai_settings_ownership
before insert or update on public.ai_settings
for each row execute function public.validate_ai_settings_ownership();

create or replace function public.validate_message_event_ownership()
returns trigger language plpgsql as $$
begin
  if new.mailbox_id is not null and not exists (select 1 from public.mailboxes m where m.id = new.mailbox_id and m.user_id = new.user_id) then
    raise exception 'event mailbox does not belong to user';
  end if;
  if new.campaign_id is not null and not exists (select 1 from public.campaigns c where c.id = new.campaign_id and c.user_id = new.user_id) then
    raise exception 'event campaign does not belong to user';
  end if;
  if new.contact_id is not null and not exists (select 1 from public.contacts c where c.id = new.contact_id and c.user_id = new.user_id) then
    raise exception 'event contact does not belong to user';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_message_event_ownership on public.message_events;
create trigger validate_message_event_ownership
before insert or update on public.message_events
for each row execute function public.validate_message_event_ownership();

-- ---------------------------------------------------------------------------
-- Atomic claim functions for background workers
-- ---------------------------------------------------------------------------

create or replace function public.claim_due_scheduled_messages(p_limit int default 25)
returns setof public.scheduled_messages
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.scheduled_messages
    where scheduled_at <= now()
      and attempt_count < max_attempts
      and (
        status = 'scheduled'
        or (status = 'sending' and claimed_at < now() - interval '15 minutes')
      )
    order by scheduled_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.scheduled_messages s
  set status = 'sending',
      claimed_at = now(),
      lock_token = gen_random_uuid(),
      updated_at = now()
  from candidates c
  where s.id = c.id
  returning s.*;
end;
$$;

create or replace function public.claim_due_campaign_contacts(p_limit int default 20)
returns setof public.campaign_contacts
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.campaign_contacts
    where scheduled_at <= now()
      and attempt_count < max_attempts
      and (
        status = 'queued'
        or (status = 'sending' and claimed_at < now() - interval '15 minutes')
      )
    order by scheduled_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.campaign_contacts c
  set status = 'sending',
      claimed_at = now(),
      lock_token = gen_random_uuid()
  from candidates x
  where c.id = x.id
  returning c.*;
end;
$$;

create or replace function public.claim_inbound_automation_messages(p_limit int default 100)
returns setof public.mail_messages
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.mail_messages
    where direction = 'inbound'
      and automation_processed_at is null
      and automation_attempt_count < 5
      and (
        automation_claimed_at is null
        or automation_claimed_at < now() - interval '15 minutes'
      )
    order by created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 250))
  )
  update public.mail_messages m
  set automation_claimed_at = now(),
      automation_attempt_count = m.automation_attempt_count + 1
  from candidates c
  where m.id = c.id
  returning m.*;
end;
$$;

revoke all on function public.claim_due_scheduled_messages(int) from public, anon, authenticated;
revoke all on function public.claim_due_campaign_contacts(int) from public, anon, authenticated;
revoke all on function public.claim_inbound_automation_messages(int) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_messages(int) to service_role;
grant execute on function public.claim_due_campaign_contacts(int) to service_role;
grant execute on function public.claim_inbound_automation_messages(int) to service_role;

-- ---------------------------------------------------------------------------
-- Atomic per-mailbox daily send quota
-- ---------------------------------------------------------------------------

create table if not exists public.mailbox_daily_usage (
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  sent_count int not null default 0 check (sent_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (mailbox_id, usage_date)
);

create index if not exists mailbox_daily_usage_user_date_idx
  on public.mailbox_daily_usage(user_id, usage_date desc);

alter table public.mailbox_daily_usage enable row level security;
drop policy if exists "mailbox daily usage own rows" on public.mailbox_daily_usage;
create policy "mailbox daily usage own rows" on public.mailbox_daily_usage
  for select using (auth.uid() = user_id);

create or replace function public.reserve_mailbox_send(p_mailbox_id uuid, p_user_id uuid, p_usage_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_limit int;
  v_status text;
  v_count int;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    return false;
  end if;

  select user_id, daily_limit, status into v_owner, v_limit, v_status
  from public.mailboxes
  where id = p_mailbox_id;

  if v_owner is null or v_owner <> p_user_id or v_status not in ('healthy','warning') then
    return false;
  end if;

  insert into public.mailbox_daily_usage(mailbox_id, user_id, usage_date, sent_count, updated_at)
  values (p_mailbox_id, p_user_id, p_usage_date, 1, now())
  on conflict (mailbox_id, usage_date) do update
    set sent_count = public.mailbox_daily_usage.sent_count + 1,
        updated_at = now()
    where public.mailbox_daily_usage.sent_count < v_limit
  returning sent_count into v_count;

  return v_count is not null and v_count <= v_limit;
end;
$$;

create or replace function public.release_mailbox_send(p_mailbox_id uuid, p_user_id uuid, p_usage_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    return;
  end if;
  update public.mailbox_daily_usage
  set sent_count = greatest(0, sent_count - 1), updated_at = now()
  where mailbox_id = p_mailbox_id and user_id = p_user_id and usage_date = p_usage_date;
end;
$$;

revoke all on function public.reserve_mailbox_send(uuid, uuid, date) from public, anon;
revoke all on function public.release_mailbox_send(uuid, uuid, date) from public, anon;
grant execute on function public.reserve_mailbox_send(uuid, uuid, date) to authenticated, service_role;
grant execute on function public.release_mailbox_send(uuid, uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Atomic AI auto-reply daily quota
-- ---------------------------------------------------------------------------

create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  auto_reply_count int not null default 0 check (auto_reply_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_daily_usage enable row level security;
drop policy if exists "ai daily usage own rows" on public.ai_daily_usage;
create policy "ai daily usage own rows" on public.ai_daily_usage
  for select using (auth.uid() = user_id);

create or replace function public.reserve_ai_auto_reply(p_user_id uuid, p_usage_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_count int;
begin
  if auth.role() <> 'service_role' then return false; end if;
  select max_auto_replies_per_day into v_limit from public.ai_settings where user_id = p_user_id;
  v_limit := coalesce(v_limit, 10);
  if v_limit <= 0 then return false; end if;

  insert into public.ai_daily_usage(user_id, usage_date, auto_reply_count, updated_at)
  values (p_user_id, p_usage_date, 1, now())
  on conflict (user_id, usage_date) do update
    set auto_reply_count = public.ai_daily_usage.auto_reply_count + 1,
        updated_at = now()
    where public.ai_daily_usage.auto_reply_count < v_limit
  returning auto_reply_count into v_count;

  return v_count is not null and v_count <= v_limit;
end;
$$;

create or replace function public.release_ai_auto_reply(p_user_id uuid, p_usage_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then return; end if;
  update public.ai_daily_usage
  set auto_reply_count = greatest(0, auto_reply_count - 1), updated_at = now()
  where user_id = p_user_id and usage_date = p_usage_date;
end;
$$;

revoke all on function public.reserve_ai_auto_reply(uuid, date) from public, anon, authenticated;
revoke all on function public.release_ai_auto_reply(uuid, date) from public, anon, authenticated;
grant execute on function public.reserve_ai_auto_reply(uuid, date) to service_role;
grant execute on function public.release_ai_auto_reply(uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- Inbox synchronization helpers
-- ---------------------------------------------------------------------------

alter table public.mailboxes
  add column if not exists sync_claimed_at timestamptz;

create or replace function public.claim_mailboxes_for_sync(p_limit int default 20)
returns setof public.mailboxes
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then return; end if;
  return query
  with candidates as (
    select id
    from public.mailboxes
    where sync_enabled = true
      and status in ('healthy','warning')
      and (sync_claimed_at is null or sync_claimed_at < now() - interval '15 minutes')
    order by last_sync_at asc nulls first
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.mailboxes m
  set sync_claimed_at = now(), updated_at = now()
  from candidates c
  where m.id = c.id
  returning m.*;
end;
$$;

create or replace function public.record_inbound_thread_activity(p_thread_id uuid, p_user_id uuid, p_message_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then return; end if;
  update public.mail_threads
  set unread_count = unread_count + 1,
      last_message_at = greatest(last_message_at, p_message_at),
      updated_at = now()
  where id = p_thread_id and user_id = p_user_id;
end;
$$;

revoke all on function public.claim_mailboxes_for_sync(int) from public, anon, authenticated;
grant execute on function public.claim_mailboxes_for_sync(int) to service_role;
revoke all on function public.record_inbound_thread_activity(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.record_inbound_thread_activity(uuid, uuid, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Per-user workspace defaults
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_name text not null default 'My Workspace',
  default_timezone text not null default 'UTC',
  default_daily_limit int not null default 20 check (default_daily_limit between 1 and 200),
  default_send_window_start time not null default '09:00',
  default_send_window_end time not null default '17:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_settings enable row level security;
drop policy if exists "workspace settings own row" on public.workspace_settings;
create policy "workspace settings own row" on public.workspace_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.workspace_settings;
create trigger set_updated_at before update on public.workspace_settings
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Outbound send idempotency / uncertain-delivery protection
-- ---------------------------------------------------------------------------

alter table public.mail_messages
  add column if not exists delivery_state text,
  add column if not exists send_idempotency_key text;

update public.mail_messages
set delivery_state = case when direction = 'inbound' then 'received' else 'sent' end
where delivery_state is null;

alter table public.mail_messages
  alter column delivery_state set default 'received',
  alter column delivery_state set not null;

alter table public.mail_messages drop constraint if exists mail_messages_delivery_state_check;
alter table public.mail_messages
  add constraint mail_messages_delivery_state_check
  check (delivery_state in ('received','pending','sent','failed','uncertain'));

create unique index if not exists mail_messages_send_idempotency_idx
  on public.mail_messages(user_id, send_idempotency_key)
  where send_idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- Manual AI draft cost guard
-- ---------------------------------------------------------------------------

alter table public.ai_settings
  add column if not exists max_ai_drafts_per_day int not null default 50
    check (max_ai_drafts_per_day between 0 and 500);

alter table public.ai_daily_usage
  add column if not exists draft_count int not null default 0
    check (draft_count >= 0);

create or replace function public.reserve_ai_draft(p_user_id uuid, p_usage_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_count int;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then return false; end if;
  select max_ai_drafts_per_day into v_limit from public.ai_settings where user_id = p_user_id;
  v_limit := coalesce(v_limit, 50);
  if v_limit <= 0 then return false; end if;

  insert into public.ai_daily_usage(user_id, usage_date, auto_reply_count, draft_count, updated_at)
  values (p_user_id, p_usage_date, 0, 1, now())
  on conflict (user_id, usage_date) do update
    set draft_count = public.ai_daily_usage.draft_count + 1,
        updated_at = now()
    where public.ai_daily_usage.draft_count < v_limit
  returning draft_count into v_count;

  return v_count is not null and v_count <= v_limit;
end;
$$;

create or replace function public.release_ai_draft(p_user_id uuid, p_usage_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then return; end if;
  update public.ai_daily_usage
  set draft_count = greatest(0, draft_count - 1), updated_at = now()
  where user_id = p_user_id and usage_date = p_usage_date;
end;
$$;

revoke all on function public.reserve_ai_draft(uuid, date) from public, anon;
revoke all on function public.release_ai_draft(uuid, date) from public, anon;
grant execute on function public.reserve_ai_draft(uuid, date) to authenticated, service_role;
grant execute on function public.release_ai_draft(uuid, date) to authenticated, service_role;

-- Keep the persisted informational model field aligned with the app default.
alter table public.ai_settings alter column model set default 'gpt-5.6-luna';
update public.ai_settings set model = 'gpt-5.6-luna' where model = 'gpt-5.6-mini';
