# MailPilot API Contract

All user routes require a valid Supabase session unless explicitly marked public. Worker routes require `CRON_SECRET` and use the service-role client only after authorization.

## Mailboxes

- `GET /api/mailboxes` — list safe mailbox metadata only. Never returns `credential_blob`.
- `POST /api/mailboxes` — connect and verify a custom IMAP/SMTP mailbox. Host SSRF checks run before any socket connection.
- `POST /api/mailboxes/test` — authenticated connection test only.
- `PATCH /api/mailboxes/:id` — pause, resume or retest a mailbox.
- `GET /api/gmail/connect` — starts OAuth state + PKCE flow.
- `GET /api/gmail/callback` — validates state/verifier, encrypts refresh token, stores mailbox.

## Unified mail

- `POST /api/messages/compose` — send immediately or create a scheduled message.
- `POST /api/messages/reply` — reply in a stored thread, preserving `In-Reply-To` and `References`.
- `POST /api/send` — backward-compatible immediate-send endpoint.
- `POST /api/inbox/sync` — authenticated manual sync for one owned mailbox.

Immediate sends accept an `Idempotency-Key` header. The key is stored per user on `mail_messages`. Repeating a finalized key returns the existing result instead of sending again. A `pending`/`uncertain` key is not resent automatically.

## Contacts/templates/campaigns

- contact CSV import validates size, email format and row count;
- campaign creation validates mailbox/template/contact ownership;
- only active contacts enter the send queue;
- unsubscribed, bounced and complained contacts remain suppressed.

## AI and automations

- `POST /api/ai/reply` — generates a user-reviewed reply draft and consumes the manual AI-draft daily quota.
- `POST /api/ai/tone` — analyze/save bounded writing samples.
- `POST /api/ai/settings` — save AI mode, caps, delay, timezone and business hours.
- `POST /api/automations` — create validated inbound-email rules only.

AI content is always generated server-side. Never accept a client-supplied OpenAI API key for execution.

## Deliverability & spam

Authenticated routes:

- `POST /api/deliverability/domain-check` — resolves MX/SPF/DMARC plus supplied DKIM selectors and stores the observation.
- `POST /api/deliverability/content-check` — local content-risk heuristics; never treated as a spam-folder verdict.
- `POST /api/deliverability/seeds` — enroll/remove an owned connected mailbox as a diagnostic seed.
- `POST /api/deliverability/placement` — start or inspect a controlled seed test. Starts are capped and recipients are limited to owned active seeds.
- `GET /api/deliverability/google/connect` — starts Google Postmaster OAuth.
- `GET /api/deliverability/google/callback` — validates OAuth state/PKCE and stores an encrypted refresh token.
- `POST /api/deliverability/google/sync` — imports verified-domain Gmail reputation/compliance observations.

Public tracking routes use high-entropy opaque tokens. Click targets also require an HMAC signature:

- `GET /api/t/:token/open.gif` — 1px observation endpoint; always returns the image and never exposes message data.
- `GET /api/t/:token/click?u=...&s=...` — verifies token/signature and redirects only to signed HTTP(S) targets.

Open/click observations are approximate because proxies, privacy features and scanners can cause false or missing events.

## Worker routes

- `/api/jobs/sync-inboxes`
- `/api/jobs/run-automations`
- `/api/jobs/send-scheduled`
- `/api/jobs/send-due`
- `/api/jobs/ramp`

Every worker must verify `CRON_SECRET` through `src/lib/cron-auth.ts`, which uses constant-time comparison. Queue work is claimed atomically in PostgreSQL before processing.

## Health

`GET /api/health` returns only coarse configuration/database readiness. It does not expose secrets or account data. Production returns HTTP 503 for a bad configuration or unavailable database.

## Public routes

The unsubscribe route is intentionally public and identifies the contact by a random unique token. Tracking endpoints are also public by design but use opaque high-entropy tokens; click redirects additionally require an HMAC signature. Keep the token high entropy; do not replace it with an email address or sequential ID.

## Error handling

- Validation/auth/user errors: 4xx.
- Daily send/AI quota exceeded: 429 where applicable.
- Worker/provider/internal failures: 5xx or a terminal queue state.
- Never return raw OAuth responses, credentials, tokens, stack traces or service-role errors containing secrets.
