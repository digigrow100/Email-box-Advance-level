import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { getWorkspaceSettings } from "@/lib/data/repository";

export default async function SettingsPage() {
  const settings = await getWorkspaceSettings();
  return <AppShell>
    <PageHeader title="Settings" description="Infrastructure, scheduling and safety defaults for the workspace." />
    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <SettingsForm initial={settings} />
      <section className="card p-5"><h2 className="font-bold">Safety controls</h2><div className="mt-4 space-y-3 text-sm text-slate-600"><p>✓ Suppression state checked before campaign sends</p><p>✓ Atomic server-side daily sending quotas</p><p>✓ Duplicate worker claims protected in the database</p><p>✓ AI auto-reply caps and business hours</p><p>✓ Private/local IMAP and SMTP hosts blocked by default</p><p>✓ Mail credentials encrypted at rest</p></div></section>
    </div>
    <section className="card mt-5 p-5"><h2 className="font-bold">Production readiness</h2><p className="mt-2 text-sm leading-6 text-slate-500">Set up SPF, DKIM and DMARC for every sending domain. Keep demo mode disabled, use HTTPS, use app passwords where supported, and start AI in draft mode until your rules have been tested.</p></section>
  </AppShell>;
}
