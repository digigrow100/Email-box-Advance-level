# MailPilot Security Model

## Secrets

Server-only secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `EMAIL_ENCRYPTION_KEY`
- `GOOGLE_CLIENT_SECRET`
- `OPENAI_API_KEY`
- `CRON_SECRET`
- `TRIGGER_SECRET_KEY`

Never expose them through `NEXT_PUBLIC_*`, browser bundles, logs, audit metadata or API responses.

## Mailbox credential encryption

Custom passwords/app passwords and Gmail refresh tokens are encrypted with AES-256-GCM using a random 12-byte IV and authentication tag. `EMAIL_ENCRYPTION_KEY` must decode from base64 to exactly 32 bytes.

Key rotation is not automatic. If adding rotation later, introduce a versioned keyring rather than rewriting `v1` ciphertext format in place.

## Gmail OAuth

The OAuth flow uses state + PKCE. State and code verifier are short-lived HttpOnly cookies. The app requests the Gmail scope required by the IMAP/SMTP OAuth approach used by this project.

## Custom mail host SSRF protection

Custom IMAP/SMTP setup resolves hostnames before connecting. Local/private/reserved destinations are blocked by default, and ports are restricted to normal mail ports. Keep `ALLOW_PRIVATE_MAIL_HOSTS=false` for public SaaS deployments.

TLS certificate validation is on by default in every environment. Keep `ALLOW_INSECURE_MAIL_TLS=false` unless testing a server you control.

## RLS and ownership

Every user table has RLS. Migrations 003 and 004 also validate ownership across foreign-key relationships, preventing a malicious client from creating an own-user row that points at another user's mailbox/contact/thread/domain/seed/tracked message.

## Privileged jobs

`/api/jobs/*` routes require `CRON_SECRET`. `src/lib/cron-auth.ts` compares the secret with `crypto.timingSafeEqual` and workers use service-role access only after that check. Do not expose service-role clients to user-facing route handlers unless there is a narrow, reviewed reason.

## AI safety

Inbound email content is untrusted. The AI prompt explicitly treats email/thread content as data, not instructions. It must not reveal secrets or follow prompt-injection requests contained in received mail.

Auto-send should remain opt-in. Unknown/suppressed contacts are downgraded to draft. Automated/system senders and common out-of-office/delivery subjects are excluded from AI auto-replies. Manual AI drafts and automatic AI replies have separate atomic daily caps to contain cost/abuse.

## Send idempotency and ambiguous provider outcomes

A successful SMTP acceptance followed by a database failure is ambiguous: retrying can duplicate the email. MailPilot stores a stable outbound `Message-ID`, a user-scoped idempotency key and an `uncertain` delivery state. Never automatically resend an `uncertain` record; require operator review.

## Abuse controls still recommended before public multi-tenant launch

Add account-level rate limits, CAPTCHA/verification at signup, provider-specific bounce/complaint webhooks, abuse monitoring, domain ownership checks where appropriate, and billing/plan quotas before opening registrations broadly.


## Tracking and placement

- Tracking is opt-in per workspace and uses an opaque 192-bit random token.
- Click redirects require an HMAC over token + destination and accept only HTTP(S). This prevents the endpoint from becoming a general open redirect.
- IP addresses are not stored raw by tracking routes; a secret-keyed truncated HMAC is stored instead.
- Seed placement may send only from/to connected mailboxes owned by the current user, and the API caps diagnostic runs.
- Public tracking endpoints use the service role only after resolving a valid opaque token; they never return database content.
- `TRACKING_SECRET` stays server-only and should be independently random in production.
- Provider reputation refresh tokens are encrypted with the same server-side credential envelope used for mailbox secrets.
