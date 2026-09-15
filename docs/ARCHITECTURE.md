# MailPilot Architecture

## Main layers

- **UI:** Next.js App Router under `src/app`.
- **User data access:** Supabase SSR client + RLS.
- **Privileged workers:** Supabase service-role client, only from protected server job routes.
- **Mailbox auth:** Gmail OAuth2 or encrypted custom mailbox password/app password.
- **Inbound:** ImapFlow -> PostalMime RFC/MIME parsing -> normalized message -> Supabase thread/message storage.
- **Outbound:** quota reservation -> Nodemailer SMTP -> thread/message/event storage.
- **AI:** OpenAI Responses API, server-only key, saved tone profile, draft-first safety model.
- **Scheduling:** Trigger.dev declarative cron tasks call protected internal job routes.

## Inbound flow

1. Trigger.dev calls `/api/jobs/sync-inboxes` with `CRON_SECRET`.
2. DB atomically claims mailboxes that need sync.
3. IMAP fetches new UIDs.
4. `syncMailboxToDatabase` resolves/creates a thread and inserts the message idempotently.
5. Reply events and campaign reply state are updated.
6. `/api/jobs/run-automations` atomically claims unprocessed inbound messages.
7. Rules are evaluated in priority order.
8. An AI action creates a draft or a delayed scheduled message.
9. Message is marked automation-processed. Failures release the claim for bounded retry.

## Outbound flow

1. Manual, scheduled or campaign send reaches `sendAndStore`.
2. A user-scoped idempotency key is checked before any quota or SMTP work.
3. DB atomically reserves the mailbox's daily send slot.
4. Thread is resolved and a `pending` outbound row with a stable `Message-ID` is stored before SMTP.
5. Runtime credentials are decrypted server-side; Gmail access token is refreshed if needed.
6. SMTP sends the message.
7. If SMTP is accepted, the same outbound row is finalized as `sent`. Secondary event/health bookkeeping is best effort and cannot turn a finalized send into a retry.
8. If SMTP definitely fails before acceptance, the row becomes `failed` and quota is released.
9. If SMTP accepts but durable finalization fails, the row becomes `uncertain`; quota is retained and automatic retry is blocked to prevent duplicate mail.

## Scheduled-message flow

`claim_due_scheduled_messages` atomically changes due rows to `sending`. The worker respects mailbox status, AI mode, AI business hours and AI daily cap. Non-terminal problems defer the row; true send failures use exponential backoff and a bounded attempt count.

## Campaign flow

`claim_due_campaign_contacts` atomically claims queue rows. The worker checks campaign/contact suppression, timezone/weekdays/send window, then sends through the same `sendAndStore` path as manual mail. This means quotas and unified-inbox storage stay consistent.

## Threading

Preserve these headers and fields whenever modifying reply code:

- provider `Message-ID`
- `In-Reply-To`
- `References`

Incoming replies first try to link by `In-Reply-To`, then fall back to the normalized external thread key.

## Demo vs live

Demo mode is only a UI/dev convenience. In production both `DEMO_MODE` and `NEXT_PUBLIC_DEMO_MODE` must be `false`. Server defaults are deliberately production-safe if the variables are absent.


## Deliverability pipeline

Outbound messages continue through the common idempotent send path. When workspace tracking is enabled, that path creates a per-message opaque token and adds an HTML open pixel and/or signed click redirects while preserving plain text. Campaign messages additionally include one-click unsubscribe headers and request SMTP DSN failure/delay notifications when supported.

Inbound sync separates normal human replies from recognizable DSN/bounce/complaint system mail before campaign/reply attribution. Diagnostic seed placement is a separate explicit action: one owned source mailbox sends to owned seed mailboxes, then IMAP searches controlled folders and may inspect `Authentication-Results`/`Received-SPF` headers.

Optional Google Postmaster sync is outside the sending critical path. A Postmaster outage or low-volume/no-data response must never prevent generic IMAP/SMTP operation.
