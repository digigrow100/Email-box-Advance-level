# MailPilot System Reference

This is the compact handoff map for coding agents. `CLAUDE.md` contains the rules; this file tells you where the moving parts live and how they fit together.

## Runtime boundaries

- Browser: UI only. Never receives mailbox credentials, refresh tokens, OpenAI keys, service-role keys or cron secrets.
- Authenticated Next.js routes: user-scoped CRUD/actions through Supabase session + RLS.
- Privileged workers: `/api/jobs/*`, authorized only through `src/lib/cron-auth.ts`, then service-role DB access.
- Database: ownership enforcement, RLS, atomic queue claims, quota reservations and stale-lock recovery.
- Mail providers: IMAP for sync/provider state, SMTP for sending. Gmail uses OAuth refresh tokens; custom mailboxes use encrypted provider credentials.

## Current tables (26)

| Table | Purpose | Critical relationships / rules |
|---|---|---|
| `mailboxes` | Connected Gmail/custom accounts | Owned by user; encrypted credential blob; health, sync cursor, daily limit, ramp state |
| `contacts` | People/recipients | User-owned; status drives suppression |
| `templates` | Reusable subject/body | User-owned |
| `campaigns` | Outreach configuration | Owns mailbox/template references; timezone and send window |
| `campaign_contacts` | Recipient queue | Same-owner campaign/contact; atomic claim, retry/backoff |
| `message_events` | Operational event stream | Optional mailbox/campaign/thread references must belong to same user |
| `mail_threads` | Unified inbox threads | Belongs to one mailbox/user; participants/unread state |
| `mail_messages` | Inbound/outbound messages | Thread/mailbox same owner; threading headers; provider UID; delivery state; idempotency key |
| `tone_profiles` | Saved writing voice | One optional default per user |
| `ai_settings` | AI policy | Mode, daily caps, delay, timezone/business hours, known-contact requirement |
| `automation_rules` | Inbound rules | Validated conditions/actions; user-owned |
| `scheduled_messages` | Draft/scheduled queue | Mailbox/thread/tone same owner; claim/retry state |
| `automation_runs` | Rule execution history | Auditability for inbound automations |
| `audit_logs` | Security/operation audit | Readable by owner; writes from trusted server helpers |
| `mailbox_daily_usage` | Send quota ledger | Atomic reservation/release per mailbox/day |
| `ai_daily_usage` | AI quota ledger | Atomic auto-reply and manual-draft counters per user/day |
| `workspace_settings` | Workspace defaults | Timezone, daily target, sending window, tracking toggles |
| `deliverability_domains` | Sending-domain auth health | MX/SPF/DKIM/DMARC observations and estimated score |
| `deliverability_checks` | Check history | Same-owner optional domain/mailbox refs |
| `seed_inboxes` | Controlled test inboxes | Must reference an owned connected mailbox |
| `placement_tests` | Placement test runs | Owned source mailbox, unique marker, capped diagnostic use |
| `placement_results` | Seed folder placement | Same-owner test/seed; Inbox/Spam/Other/Not-found |
| `message_tracking_tokens` | Per-message tracking IDs | Opaque token; same-owner outbound message |
| `message_tracking_events` | Tracking observations | Open/click; approximate, not human-proof |
| `provider_integrations` | Reputation providers | Encrypted Google Postmaster refresh token today |
| `provider_reputation_snapshots` | Provider observations | Gmail spam/auth/TLS/error/compliance snapshots |

Schema source of truth is `supabase/migrations`. Never infer columns from this summary when writing SQL.

## Database functions that workers rely on

- `claim_due_scheduled_messages`
- `claim_due_campaign_contacts`
- `claim_inbound_automation_messages`
- `claim_mailboxes_for_sync`
- `reserve_mailbox_send` / `release_mailbox_send`
- `reserve_ai_auto_reply` / `release_ai_auto_reply`
- `reserve_ai_draft` / `release_ai_draft`
- `record_inbound_thread_activity`

Do not replace atomic claim/quota functions with client-side counting or select-then-update logic.

## Outbound delivery state machine

`pending` -> SMTP attempt -> one of:

- `sent`: provider accepted and durable finalization succeeded.
- `failed`: provider rejected/failed before acceptance; quota may be released according to the send path.
- `uncertain`: provider may have accepted but database finalization was not durable. Never auto-retry. Operator review is required.

Every retryable workflow supplies a stable idempotency key. All actual SMTP sends go through `src/lib/mail/send.ts` / `sendAndStore`.

## Inbound flow

1. Trigger.dev calls protected inbox-sync job.
2. Worker atomically claims mailboxes.
3. ImapFlow fetches INBOX messages.
4. PostalMime parses RFC/MIME safely into bounded normalized content.
5. `(mailbox_id, provider_uid)` keeps message ingest idempotent.
6. Thread/reply attribution and unread/contact/campaign state are updated.
7. Automation worker atomically claims unprocessed inbound messages.
8. Rules execute local/provider actions or create AI drafts/scheduled replies.

## Deliverability flow

1. Domain check resolves MX/TXT and stores SPF/DMARC plus selector-based DKIM observations.
2. `sendAndStore` optionally adds a per-message open pixel and signed click redirects, requests DSN failure/delay notices, and keeps plain text.
3. Inbox sync classifies normal replies separately from recognizable DSN/bounce/complaint system mail and suppresses identified bad recipients.
4. Seed placement sends only to owned connected seed inboxes, then uses IMAP folder inspection to classify Inbox/Spam/Other/Not-found.
5. Optional Google Postmaster v2 sync stores Gmail-side spam/auth/TLS/delivery-error/compliance snapshots for verified domains.
6. The UI combines these signals into an explicitly estimated health score. Exact arbitrary-recipient folder placement is never claimed.

## Provider mailbox actions

- `mark_read`: local state first, then best-effort `\Seen` over IMAP when provider UID exists.
- `archive`: local state first, then best-effort move to provider Archive/All Mail folder.
- Provider mutation failure becomes a warning event; it must not cause duplicate AI replies.

## AI flow

- Manual draft: authenticated route -> reserve manual AI quota -> bounded thread/tone context -> Responses API -> return draft.
- Auto reply: inbound rule -> safety checks -> reserve atomic auto-reply quota -> generate -> delayed scheduled message -> common send path.
- Inbound mail is untrusted prompt content. Never let it override system/owner instructions, expose secrets or authorize external actions.

## Worker cadence

- inbox sync: 10 minutes
- inbound automation: 2 minutes
- scheduled sends: 2 minutes
- campaigns: 5 minutes
- sending ramp: daily

Worker schedules are under `src/trigger`; HTTP implementations are under `src/app/api/jobs`.

## Key API groups

- Mailboxes/Gmail: `/api/mailboxes*`, `/api/gmail/*`
- Mail: `/api/messages/*`, `/api/send`, `/api/inbox/sync`
- Campaigns/contacts/templates: respective `/api/*` routes
- AI: `/api/ai/reply`, `/api/ai/tone`, `/api/ai/settings`
- Automations: `/api/automations*`
- Workers: `/api/jobs/*`
- Readiness: `/api/health`
- Public token flows: unsubscribe plus opaque/signed open/click tracking endpoints

See `docs/API.md` for the contract details.

## Security invariants

1. RLS remains on for user-owned data.
2. Cross-user FK validation remains enforced in Postgres.
3. Credentials stay AES-256-GCM encrypted at rest.
4. Custom mail hosts are DNS-resolved and private/reserved targets are blocked by default.
5. TLS certificate verification remains enabled by default.
6. Cron auth uses constant-time comparison.
7. No credential/token/secret logging.
8. No fake opens or artificial mailbox-to-mailbox warm-up loops.

## Production release order

1. Provision Supabase.
2. Apply migrations 001 -> 002 -> 003 -> 004.
3. Configure environment from `.env.example`.
4. Configure Google OAuth callback.
5. Run `npm run preflight`, lint, typecheck and build.
6. Deploy the Next.js app.
7. Confirm `/api/health` returns 200.
8. Deploy Trigger.dev schedules.
9. Live-test one Gmail and one custom mailbox.
10. Run two-user RLS, overlapping-worker, quota, idempotency and AI-safety tests before opening access broadly.

## Known deliberate scope boundaries

Attachment metadata is parsed, but attachment binary storage/download is not yet implemented. Provider-specific bounce/complaint webhooks, arbitrary-recipient Inbox/Spam visibility, billing/plans, team/organization roles and large-scale analytics are separate future subsystems. Do not pretend these are complete.
