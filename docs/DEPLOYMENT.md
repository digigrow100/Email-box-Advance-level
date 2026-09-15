# Deployment Guide

## Recommended order

1. Create Supabase project.
2. Apply migrations `001`, `002`, `003`, `004` in order.
3. Configure auth users/policies as needed for your deployment.
4. Generate `EMAIL_ENCRYPTION_KEY`, `TRACKING_SECRET` and `CRON_SECRET`.
5. Configure Gmail OAuth callback URL for the final HTTPS domain; configure the Postmaster callback too if using Google reputation metrics.
6. Configure OpenAI only if AI features are enabled.
7. Deploy Next.js app.
8. Deploy/sync Trigger.dev jobs.
9. Connect one test Gmail mailbox and one test professional mailbox.
10. Test sync, manual send, reply threading, scheduled send, campaign suppression and AI draft mode.
11. Test deliverability DNS checks, tracking opt-in/out, DSN/bounce classification and one controlled seed placement run.
12. If Postmaster is enabled, connect a verified domain and confirm a sync can handle both populated and low-volume/no-data responses.
13. Only then enable AI auto-send for narrow low-risk rules.

## Required production flags

```env
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false
ALLOW_INSECURE_MAIL_TLS=false
ALLOW_PRIVATE_MAIL_HOSTS=false
NEXT_PUBLIC_APP_URL=https://your-domain.example
```

## Validation commands

```bash
npm install
npm run preflight
npm run lint
npm run typecheck
npm run build
npm run trigger:dev
```

Use `npm run trigger:deploy` for production after application deployment.


## Readiness endpoint

After deployment, check `GET /api/health`. It should return HTTP 200 with `status: ok`. HTTP 503 means configuration or database readiness failed.

Use `docs/PRODUCTION_CHECKLIST.md` for the full launch gate.
