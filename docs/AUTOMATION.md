# Automation Engine

## Supported trigger

Current production trigger: `inbound_email`.

The database schema also reserves `scheduled` and `manual`, but the public create API intentionally accepts only `inbound_email` until those execution paths are implemented and tested.

## Conditions

Validated fields:

- mailbox ID
- sender contains
- subject contains
- body contains
- known contact required

## Actions

- `mark_read` — updates local state and best-effort sets the provider IMAP `\Seen` flag when a provider UID is available.
- `archive` — updates local state and best-effort moves the provider message to a discovered Archive/All Mail folder.
- `ai_reply`

AI reply can be `off`, `draft`, or `auto_send` and supports bounded delay, optional tone profile and trusted owner instructions.

## Auto-reply guardrails

Auto-send is blocked/downgraded when:

- global AI mode is no longer auto-send;
- known-contact requirement is enabled and sender is unknown;
- contact is bounced, unsubscribed or complained;
- sender resembles no-reply, postmaster, mailer-daemon, etc.;
- subject resembles out-of-office, automatic reply or delivery failure;
- AI daily cap is exhausted;
- current time is outside configured business hours.

Provider mailbox mutations are best-effort. A provider failure is logged as a warning event and does not silently erase the local automation result.

## Idempotency

Inbound messages are DB-claimed before rules run. Successful processing sets `automation_processed_at`. Failed processing clears the claim but increments an attempt counter; the claim function stops after the bounded retry count.

## AI tone

Tone samples are stored in `tone_profiles`. Keep examples short and representative. The AI receives only a bounded number/length of recent messages and examples to control cost and reduce prompt-injection surface.

## Warm-up policy

MailPilot's “warm-up” is a safe sending ramp only: gradually increase real, legitimate sending volume. Do not implement fake opens, artificial mailbox-to-mailbox reply loops or other spam-filter manipulation.
