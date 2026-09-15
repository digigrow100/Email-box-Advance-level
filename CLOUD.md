# MailPilot Cloud / Production Setup

This file is for deployment-oriented coding agents and operators. Read `CLAUDE.md`, `docs/SYSTEM_REFERENCE.md`, `docs/DEPLOYMENT.md` and `docs/SECURITY.md` before production changes.

## Deployment components

- Next.js application host (Vercel or another Node-compatible host)
- Supabase PostgreSQL + Auth
- Trigger.dev project
- Google OAuth client for Gmail and optional Google Postmaster Tools
- OpenAI API key if AI features are enabled
- DNS authentication on every sending domain: SPF, DKIM, DMARC

## Required database setup

Apply in order:

1. `supabase/migrations/001_initial.sql`
2. `supabase/migrations/002_unified_inbox_automation_ai.sql`
3. `supabase/migrations/003_production_hardening.sql`
4. `supabase/migrations/004_deliverability_center.sql`

Migration 003 is required for atomic send quotas/worker locking. Migration 004 is required for Deliverability & Spam Center data, tracking, seed placement and provider reputation. Do not deploy current code against only migrations 001–003.

## Production environment

Use `.env.example` as the complete key list. In production:

```env
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false
ALLOW_INSECURE_MAIL_TLS=false
ALLOW_PRIVATE_MAIL_HOSTS=false
NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN
```

Generate strong values for `EMAIL_ENCRYPTION_KEY`, `TRACKING_SECRET` and `CRON_SECRET`. Keep all server secrets out of browser-exposed variables.

## Google OAuth

Configure the exact HTTPS callback:

`https://YOUR_DOMAIN/api/gmail/callback`

Optional Google Postmaster callback:

`https://YOUR_DOMAIN/api/deliverability/google/callback`

Both flows use state + PKCE; refresh tokens are stored encrypted.

## Trigger.dev

Internal recurring tasks are declarative under `src/trigger`:

- sync inboxes
- process inbound automations
- send scheduled messages
- send campaign queue
- ramp mailbox limits

Deploy the web app first, then deploy Trigger.dev so job callbacks reach a live HTTPS URL.

## Release gate

Run `npm run preflight` first. A release is not production-ready until `npm run check` passes and live tests succeed with one Gmail and one custom IMAP/SMTP mailbox. Also test two-user RLS isolation and intentionally overlapping job calls.

Check `GET /api/health` after deployment; it must return HTTP 200.

See `docs/OPERATIONS.md` for failures and recovery and `docs/PRODUCTION_CHECKLIST.md` for the full launch gate.
