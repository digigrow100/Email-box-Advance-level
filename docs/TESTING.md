# MailPilot Test Matrix

Run `npm run preflight`, `npm run lint`, `npm run typecheck` and `npm run build` before deployment. Live tests require isolated test mailboxes.

## Identity and tenancy

1. Create User A and User B.
2. Connect separate mailboxes.
3. Confirm User A cannot read/update/delete or reference User B mailbox, thread, contact, template, tone profile or campaign IDs.
4. Attempt cross-user foreign-key inserts and confirm database ownership triggers reject them.

## Gmail OAuth

- valid connect/callback;
- state mismatch rejected;
- missing PKCE verifier rejected;
- revoked refresh token becomes a mailbox health error;
- reconnect restores health without exposing token material.

## Custom IMAP/SMTP

- valid Hostinger/cPanel-style account;
- invalid password;
- bad TLS certificate rejected;
- localhost/private/reserved host rejected;
- disallowed ports rejected;
- retest recovers a mailbox after credentials/provider recovery.

## Inbound sync

- plain text;
- HTML only;
- quoted-printable/base64;
- multipart alternative;
- non-ASCII UTF-8;
- attachment metadata;
- duplicate UID sync is idempotent;
- same message seen in overlapping sync workers is not duplicated;
- reply links by `In-Reply-To` and updates campaign reply state.

## Outbound idempotency

- same `Idempotency-Key` after a finalized send does not resend;
- overlapping scheduled workers claim once;
- overlapping campaign workers claim once;
- SMTP reject releases mailbox quota and permits bounded retry;
- SMTP accepted + DB finalization failure becomes `uncertain` and is never blindly retried;
- logging failure after a finalized send does not change delivery to uncertain.

## Quotas

- mailbox daily quota cannot be exceeded by concurrent sends;
- failed pre-accept SMTP send releases quota;
- AI auto-reply cap is atomic;
- manual AI draft cap is atomic;
- dates roll over in the configured timezone.

## AI safety

- prompt injection inside incoming email does not change system rules;
- unknown contacts are downgraded from auto-send when required;
- unsubscribed/bounced/complained contacts never get automatic replies;
- no-reply, delivery failure and out-of-office patterns skip auto-reply;
- business-hours rules work across midnight;
- AI failure releases manual draft quota.

## Campaigns

- suppressed contacts never enter/send from queue;
- send window and timezone honored;
- queue retries use bounded exponential backoff;
- incoming reply marks campaign contact replied.


## Deliverability and tracking

- domain check stores MX/SPF/DMARC and selector-based DKIM observations;
- missing/unlisted DKIM selector remains `unknown`, not a false hard failure;
- tracking disabled sends no pixel/redirect; tracking enabled preserves plain text and adds only signed tracking URLs;
- invalid click signature cannot redirect to attacker-controlled target;
- repeated open/click requests may create multiple raw events but aggregate rates count unique messages;
- raw IP address is never stored by tracking routes;
- recognizable bounce/DSN is classified separately from normal reply and suppresses the extracted failed recipient;
- complaint/feedback pattern suppresses the recipient as `complained` when identifiable;
- placement start can target only owned active seed mailboxes, caps seeds at 20 and caps runs at 10 per UTC day;
- placement scan finds Inbox, Junk/Spam, Other and Not-found cases;
- User A cannot reference User B deliverability domain, mailbox, message, seed, placement test or reputation snapshot;
- Google Postmaster OAuth state mismatch is rejected; refresh token remains encrypted;
- Postmaster sync handles verified domains with stats and low-volume domains with absent metrics without inventing values.

## Operations

- `/api/health` returns 200 when ready and 503 when misconfigured/unhealthy;
- stale worker claims recover after lease timeout;
- paused/error mailbox is not sent from;
- audit logs contain identifiers/metadata but no secrets.
