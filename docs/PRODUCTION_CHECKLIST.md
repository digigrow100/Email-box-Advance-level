# Production Launch Checklist

## Before first deploy

- [ ] All migrations applied in numeric order.
- [ ] `npm run preflight` passes with production environment variables.
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` pass.
- [ ] `DEMO_MODE=false` and `NEXT_PUBLIC_DEMO_MODE=false`.
- [ ] HTTPS application URL configured.
- [ ] Strong 32-byte base64 `EMAIL_ENCRYPTION_KEY` stored only server-side.
- [ ] Random `CRON_SECRET` stored only server-side/Trigger.dev.
- [ ] Independent random `TRACKING_SECRET` stored only server-side.
- [ ] Gmail OAuth redirect URI exactly matches production callback.
- [ ] Postmaster redirect URI configured if Google reputation sync will be used.
- [ ] `ALLOW_INSECURE_MAIL_TLS=false`.
- [ ] `ALLOW_PRIVATE_MAIL_HOSTS=false` unless this is a private trusted deployment.

## Live smoke test

- [ ] Connect one Gmail test mailbox.
- [ ] Connect one professional IMAP/SMTP test mailbox.
- [ ] Sync a multipart inbound email.
- [ ] Send one manual message and verify thread storage.
- [ ] Reply externally and verify thread linkage.
- [ ] Schedule one message.
- [ ] Run two worker calls concurrently and confirm one send.
- [ ] Test unsubscribe/suppression.
- [ ] Generate an AI draft with a prompt-injection test email.
- [ ] Keep AI auto-send in draft mode until rules are reviewed.
- [ ] Run SPF/DKIM/DMARC/MX check on a test sending domain.
- [ ] Enable open/click tracking temporarily and verify signed tracking endpoints, then set the desired privacy default.
- [ ] Send a controlled placement test to owned seed inboxes and verify Inbox/Spam/Other detection.
- [ ] Process a test DSN/bounce message and confirm it is not counted as a human reply.
- [ ] Verify campaign List-Unsubscribe one-click POST suppresses the contact.

## Before public multi-tenant signup

- [ ] Signup verification / anti-abuse controls.
- [ ] Account/plan API rate limits.
- [ ] Domain/mailbox ownership policy as appropriate for the product.
- [ ] Provider-specific bounce/complaint webhook ingestion if required beyond inbox DSN/feedback parsing.
- [ ] Monitoring/alerting for sync failures, high bounce rate and uncertain sends.
- [ ] Data retention/deletion policy, including raw tracking-event retention.
- [ ] Privacy/terms and processor disclosures appropriate to deployment jurisdiction.
- [ ] Backup/restore procedure tested.
