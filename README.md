# MailPilot

MailPilot is a Next.js unified email operations app for Gmail and professional IMAP/SMTP accounts. It provides one inbox, compose/reply/scheduling, controlled outreach campaigns, safe sending ramps, automation rules, and AI-assisted replies that can follow a saved writing style.

## What is included

- Gmail connection with OAuth2 state + PKCE
- custom professional mailbox connection with IMAP + SMTP
- encrypted mailbox credentials/tokens
- custom mail-host SSRF protection and TLS verification
- unified inbox and reply threading
- manual, scheduled and campaign sending
- atomic per-mailbox daily send quotas
- safe real-volume sending ramp
- contacts, CSV import, suppression and unsubscribe
- campaign send windows and reply attribution
- automation rules for inbound mail, including provider-backed mark-read/archive actions
- AI draft/auto-send modes with tone profiles
- prompt-injection-aware AI instructions
- AI business hours, known-contact guard, atomic auto-reply cap and manual AI-draft cap
- outbound idempotency keys + `pending/sent/failed/uncertain` delivery states
- worker claim locks, stale-lock recovery, bounded retries and backoff
- mailbox health fields and operational events
- audit log
- real workspace settings
- demo mode for UI preview
- Deliverability & Spam Center with SPF/DKIM/DMARC/MX checks
- controlled seed-inbox placement tests (Inbox / Spam / Other / Not found)
- opt-in open/click tracking with privacy-aware caveats
- DSN failure/delay requests plus bounce/complaint classification
- one-click List-Unsubscribe headers for campaign mail
- local content spam-risk heuristics
- optional Google Postmaster Tools v2 reputation/compliance sync

## Safety boundary

“Warm-up” in MailPilot means gradually increasing legitimate real sending volume. The project intentionally does not create fake opens or artificial mailbox-to-mailbox reply loops to manipulate spam filters.

## Stack

- Next.js + React + TypeScript + Tailwind CSS
- Supabase Auth/PostgreSQL/RLS
- ImapFlow
- PostalMime (RFC/MIME parsing)
- Nodemailer
- Trigger.dev
- OpenAI Responses API

## Local preview

```bash
cp .env.example .env.local
npm install
npm run dev
```

Keep these enabled only for sample data:

```env
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
```

Open `http://localhost:3000`.

## Live database setup

Apply all migrations in order:

```text
001_initial.sql
002_unified_inbox_automation_ai.sql
003_production_hardening.sql
004_deliverability_center.sql
```

Migrations 003 and 004 are required by the current workers, send path and Deliverability & Spam Center.

## Production essentials

Generate an encryption key:

```bash
openssl rand -base64 32
```

Generate a cron secret:

```bash
openssl rand -hex 32
```

Set the final HTTPS app URL, Supabase keys, Google OAuth credentials, Trigger.dev credentials and (optionally) OpenAI key. Set both demo flags to false.

The default AI model is environment-configurable. No application code needs to change when you switch model IDs.

## Main pages

- `/dashboard`
- `/inbox`
- `/compose`
- `/mailboxes`
- `/warmup`
- `/campaigns`
- `/contacts`
- `/templates`
- `/scheduled`
- `/automations`
- `/ai`
- `/activity`
- `/settings`
- `/deliverability`

## Background jobs

- inbox sync — every 10 minutes
- inbound automations — every 2 minutes
- scheduled sender — every 2 minutes
- campaign sender — every 5 minutes
- sending ramp — daily

Workers call protected `/api/jobs/*` routes and rely on PostgreSQL claim functions to avoid duplicate processing.

## Documentation

Read these before changing production behavior:

- `CLAUDE.md` — complete coding-agent instructions
- `docs/ARCHITECTURE.md` — data/worker flows
- `docs/DATABASE.md` — all 26 tables, relationships and DB functions
- `docs/SYSTEM_REFERENCE.md` — one-file agent handoff for tables, routes, workers and invariants
- `docs/SECURITY.md` — secrets, RLS, OAuth, SSRF and AI safety
- `docs/AUTOMATION.md` — rule engine and auto-reply guardrails
- `docs/OPERATIONS.md` — retry/health/incident runbook
- `docs/API.md` — endpoint contracts and idempotency behavior
- `docs/TESTING.md` — integration/concurrency/security test matrix
- `docs/PRODUCTION_CHECKLIST.md` — launch gate
- `docs/DEPLOYMENT.md` — deployment order and release gate
- `docs/DELIVERABILITY.md` — tracking, seed placement, DSN/bounce logic, Postmaster and signal limits
- `VALIDATION.md` — what was and was not validated in the generated bundle

## Checks

```bash
npm run preflight
npm run lint
npm run typecheck
npm run build
```

Or:

```bash
npm run check
```

Live provider behavior still requires real test credentials. Before production, test one Gmail mailbox and one custom mailbox, then test RLS using two separate users.


## Readiness

Production exposes `GET /api/health` for a coarse configuration/database readiness check. It never returns credentials or mailbox data.
