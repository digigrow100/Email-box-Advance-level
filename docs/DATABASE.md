# MailPilot Database Map

MailPilot uses Supabase PostgreSQL. Apply migrations in numeric order. Never edit an already-applied production migration; add a new migration instead.

## Migration order

1. `001_initial.sql` — mailboxes, contacts, templates, campaigns, campaign queue, events, base RLS.
2. `002_unified_inbox_automation_ai.sql` — threads, messages, tone, AI settings, automations, scheduled messages.
3. `003_production_hardening.sql` — ownership guards, atomic worker claims, daily quotas, health fields, audit logs, retry state, workspace settings.
4. `004_deliverability_center.sql` — domain health, seed placement, open/click tracking, provider reputation, tracking settings and deliverability ownership guards.

## Tables

### `mailboxes`
One connected Gmail or custom IMAP/SMTP mailbox.

Important fields: `user_id`, `provider`, `email`, encrypted `credential_blob`, IMAP/SMTP hosts and ports, `status`, `daily_limit`, ramp fields, sync cursor, health fields, timezone.

Secrets are encrypted in application code with AES-256-GCM before insertion. Never return `credential_blob` to a client component.

### `contacts`
Workspace contacts and suppression state.

Statuses: `active`, `replied`, `bounced`, `unsubscribed`, `complained`.

`unsubscribe_token` is globally unique and is used by the public opt-out route.

### `templates`
Reusable campaign subject/body templates.

### `campaigns`
Campaign configuration. Belongs to one mailbox and optionally one template. Stores timezone and local sending window.

### `campaign_contacts`
Join/queue table between campaigns and contacts. Also holds retry/claim state.

Statuses: `queued`, `sending`, `sent`, `failed`, `replied`, `skipped`.

### `message_events`
Operational event stream for sends, replies, failures, bounces, warnings, unsubscribe, sync failures and automation events.

Do not store passwords, refresh tokens or full API responses here.

### `mail_threads`
Unified-inbox thread for one mailbox. Holds participants, unread count and last-message timestamp.

### `mail_messages`
Inbound/outbound message record. Stores threading headers (`provider_message_id`, `in_reply_to`, `references_header`) and AI provenance.

Automation claim/processed fields make inbound rule execution retryable and idempotent.

Outbound delivery fields are equally important: `delivery_state` is `pending`, `sent`, `failed` or `uncertain` for outbound mail (`received` for inbound), and `send_idempotency_key` is unique per user when present. Never auto-retry `uncertain` mail.

### `tone_profiles`
Saved writing-style instructions and short examples. A partial unique index allows only one default profile per user.

### `ai_settings`
One row per user. Controls draft/auto-send mode, automatic-reply cap, manual AI-draft cap, reply delay, business hours, timezone and known-contact requirement.

### `automation_rules`
Inbound email rules. `conditions` and `actions` are JSON but API validation restricts supported shapes.

### `scheduled_messages`
Draft/scheduled outbound queue. Contains retry fields, claim lock, threading headers and AI source metadata.

### `automation_runs`
Audit trail for rule matches, skips, generated drafts, scheduling and failures.

### `audit_logs`
Security/operational audit log for important user/system/automation actions. User can read own rows; normal client writes are not allowed.

### `mailbox_daily_usage`
Atomic per-mailbox send quota. Primary key is `(mailbox_id, usage_date)`. All real sends reserve a slot before SMTP and release it if the send fails.

### `ai_daily_usage`
Atomic per-user AI usage counters. `auto_reply_count` is reserved by the scheduled worker and `draft_count` limits manual AI draft generation.

### `workspace_settings`
Per-user workspace defaults: name, timezone, default daily limit, send window, and opt-in open/click tracking toggles.

### `deliverability_domains`
Per-user sending-domain health cache. Stores the last observed SPF, DKIM, DMARC and MX status, score and raw check details. DKIM can be `unknown` when the checked selector set does not include the live selector.

### `deliverability_checks`
Historical deliverability observations (`dns`, `content`, `bounce_health`, `provider_reputation`, `blocklist`, `placement`). Optional domain/mailbox foreign keys are ownership-validated.

### `seed_inboxes`
Connected mailboxes explicitly enrolled as diagnostic seed inboxes. A seed mailbox must belong to the same user. These inboxes are the only place where MailPilot may claim actual folder placement.

### `placement_tests` / `placement_results`
A controlled test sends a unique marker from an owned source mailbox to owned seed inboxes. Results store `inbox`, `spam`, `other`, `not_found` or `unknown`, matched folder and timestamps. Tests are rate-capped in the API.

### `message_tracking_tokens` / `message_tracking_events`
Opaque random per-message token plus observed `open`/`click` events. The tracking token must reference a message owned by the same user. Events intentionally retain repeated observations; aggregate UI metrics count unique tracked messages.

### `provider_integrations`
Encrypted optional third-party reputation connection. Currently supports `google_postmaster`. Provider credentials never go to the browser.

### `provider_reputation_snapshots`
Time-bounded Postmaster metrics/compliance snapshots linked to an owned `deliverability_domains` row. RLS and trigger validation prevent cross-user domain references.

## Ownership invariants

RLS alone is not enough for foreign keys. Migrations 003 and 004 add triggers so related records cannot cross users. Examples:

- a campaign cannot reference another user's mailbox/template;
- a thread/message cannot reference another user's mailbox/thread;
- a scheduled message cannot reference another user's mailbox/thread/tone profile;
- a campaign queue row cannot join a user's campaign to another user's contact;
- deliverability checks cannot point at another user's domain/mailbox;
- tracking tokens cannot point at another user's message;
- placement results cannot point at another user's test/seed;
- reputation snapshots cannot point at another user's domain.

Do not remove these triggers to “fix” an insert. Fix the calling code instead.

## Atomic worker functions

Server workers use PostgreSQL functions with `FOR UPDATE SKIP LOCKED`:

- `claim_due_scheduled_messages`
- `claim_due_campaign_contacts`
- `claim_inbound_automation_messages`
- `claim_mailboxes_for_sync`
- `reserve_mailbox_send` / `release_mailbox_send`
- `reserve_ai_auto_reply` / `release_ai_auto_reply`
- `reserve_ai_draft` / `release_ai_draft`
- `record_inbound_thread_activity`

Claim functions prevent overlapping cron runs from processing the same item twice. They are deliberately restricted by database grants.
