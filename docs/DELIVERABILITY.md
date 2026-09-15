# MailPilot Deliverability & Spam Center

MailPilot combines direct delivery signals with clearly labeled estimates. It must never claim knowledge the sender cannot actually observe.

## Signal classes

### Direct / strong

- SMTP accept/reject result from the configured sending provider.
- DSN/bounce messages that can be parsed from the connected inbox.
- Normal inbound replies.
- SPF, DMARC and MX DNS records.
- DKIM only for selectors actually queried.
- Inbox/Spam/Other placement in connected seed inboxes that MailPilot can inspect over IMAP.

### Approximate / noisy

- Open events: image proxies, privacy systems and cached images can generate or hide requests.
- Click events: security scanners may follow links.
- Content spam-risk score: local heuristics, not a receiving-provider verdict.
- Overall health score: an estimate derived from authentication and observed behavior.

## Outbound instrumentation

When workspace tracking is enabled, `sendAndStore` creates one `message_tracking_tokens` row before SMTP. The HTML alternative may contain:

- `/api/t/:token/open.gif` for open observation;
- signed `/api/t/:token/click` redirects for HTTP(S) links.

Plain text is always preserved. Campaign mail also carries `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, and SMTP requests DSN failure/delay notifications where the server supports DSN.

## Bounce / complaint handling

`src/lib/deliverability/bounce.ts` classifies recognizable DSN/mailer-daemon/feedback-loop messages during inbox sync. When the failed recipient can be extracted, the contact is suppressed and the related campaign queue item is moved out of the active send path. Do not treat a DSN as a normal reply.

## Seed Inbox Placement

Seed inboxes must be existing connected mailboxes owned by the user. A placement test:

1. chooses one owned source mailbox;
2. creates a unique marker;
3. sends only to active owned seeds (maximum 20 per run);
4. limits the workspace to 10 new placement tests per UTC day;
5. later scans seed folders with IMAP;
6. records `inbox`, `spam`, `other`, `not_found` or `unknown`;
7. when available, records recipient-side `Authentication-Results` / `Received-SPF` outcomes for SPF, DKIM and DMARC.

This is the only feature allowed to show an exact folder-placement result. Never extrapolate a seed result into a claim that an arbitrary client email landed in that same folder.

## Domain authentication

`src/lib/deliverability/dns.ts` checks MX, SPF, DMARC and an explicit bounded list of DKIM selectors. DKIM selector discovery is not universal, so no matching supplied selector must remain `unknown`, not `fail`.

## Google Postmaster Tools

The optional Postmaster integration uses OAuth + PKCE, encrypts the refresh token, lists domains available to the connected Google account, and imports 7-day overall metrics/compliance. Current metrics requested include spam rate, SPF/DKIM/DMARC authentication success, delivery-error rate and TLS-encryption rate.

Postmaster data is Gmail-specific and may be unavailable for low-volume domains. Generic MailPilot functionality must not depend on it.

## Privacy and retention

- Do not store raw tracking IP addresses.
- Keep tracking disabled by default.
- Explain tracking to users and honor applicable privacy/marketing law.
- At scale, add a retention job for raw `message_tracking_events`; aggregate statistics can live longer than raw events.

## Future adapters

Possible future integrations include provider-specific bounce/complaint webhooks, sending-IP/rDNS checks, and reputable blocklist-monitoring APIs. Do not fake these checks without a reliable data source and a known sending IP.
