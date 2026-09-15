# Operations Runbook

## Normal worker cadence

- inbox sync: every 10 minutes
- inbound automations: every 2 minutes
- scheduled messages: every 2 minutes
- campaign queue: every 5 minutes
- mailbox ramp: daily at 05:00 cron time

Trigger.dev schedules are declarative and live in `src/trigger`.

## Mailbox health

Important fields on `mailboxes`:

- `status`
- `consecutive_failures`
- `last_error` / `last_error_at`
- `last_successful_sync_at`
- `last_successful_send_at`
- `sync_claimed_at`

Background sync moves repeated failures from warning to error after five failures. A mailbox in error needs investigation/re-test before being returned to healthy operation.

## Stuck work

Claim functions treat old locks as stale after 15 minutes. This allows recovery after a worker crash. Do not create a second independent queue consumer that bypasses these claim functions.

## Retry policy

Scheduled/campaign SMTP failures back off exponentially and stop after `max_attempts`. Deferrals caused by business hours or mailbox daily quota do not count as SMTP attempts.

## Incident checklist

1. Pause affected mailbox/campaign.
2. Inspect `last_error`, `message_events`, `automation_runs`, `audit_logs`.
3. Confirm provider login and OAuth/app-password state.
4. Confirm SPF/DKIM/DMARC and provider sending restrictions outside MailPilot.
5. Re-test one mailbox before re-enabling volume.

## Database migration discipline

Back up production before schema changes. Apply migrations in staging first. Never squash or edit migrations already applied to production.

## Ambiguous SMTP acceptance

If SMTP may have accepted a message but durable database finalization failed, the outbound row is marked `uncertain`. Do not automatically retry it. Inspect provider sent mail/logs, then resolve manually. A finalized `sent` message is never downgraded merely because secondary event/health logging failed.

## Campaign completion

The campaign worker moves a campaign to `completed` when no `queued` or `sending` recipient rows remain. Failed/uncertain recipient rows remain available for operator review rather than being silently re-enqueued.


## Deliverability incidents

### Sudden bounce-rate increase
Pause the affected mailbox/campaign, inspect DSN diagnostics, verify list quality and rerun domain authentication checks. Do not increase sending volume while the cause is unknown.

### Seed placement moves to spam
Compare more than one controlled seed/provider, inspect recipient-side SPF/DKIM/DMARC results, review recent bounce/complaint rate, sending-volume changes and content risk. A single seed result is diagnostic evidence, not a universal recipient verdict.

### Open rate suddenly spikes
Assume proxy/scanner activity before assuming human engagement. Compare unique clicks/replies and user-agent metadata; never use open rate alone for automatic sending decisions.

### Postmaster returns no metrics
This can be normal for a low-volume domain or unavailable date range. Keep values null/unknown; do not convert missing provider data into zeros or a bad reputation verdict.

### Tracking domain/app URL changes
Update `NEXT_PUBLIC_APP_URL`, confirm HTTPS, and send new test messages. Old signed links use the URL embedded at send time and should not be rewritten in stored messages.
