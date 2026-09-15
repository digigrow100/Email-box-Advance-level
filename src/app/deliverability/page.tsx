import { AppShell } from "@/components/app-shell";
import { DeliverabilityControls } from "@/components/deliverability-controls";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { getDeliverabilityOverview, getProviderReputationOverview } from "@/lib/data/repository";
import { ProviderReputationPanel } from "@/components/provider-reputation-panel";
import { AlertTriangle, Eye, MousePointerClick, ShieldCheck } from "lucide-react";

function authBadge(status: string) {
  const cls = status === "pass" ? "bg-emerald-50 text-emerald-700" : status === "fail" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${cls}`}>{status}</span>;
}

export default async function DeliverabilityPage() {
  const [data, provider] = await Promise.all([getDeliverabilityOverview(), getProviderReputationOverview()]);
  const m = data.metrics;
  return <AppShell>
    <PageHeader title="Deliverability & Spam" description="Measure the signals MailPilot can observe: authentication, bounces, complaints, engagement, content risk and placement in test inboxes you control." />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={ShieldCheck} label="Estimated health" value={`${m.score}/100`} note="Authentication + observed delivery signals" />
      <StatCard icon={AlertTriangle} label="Bounce rate · 30d" value={`${m.bounceRate}%`} note={`${m.sent30d} sent messages observed`} />
      <StatCard icon={Eye} label="Tracked open rate" value={`${m.openRate}%`} note="Approximate; privacy proxies can distort opens" />
      <StatCard icon={MousePointerClick} label="Tracked click rate" value={`${m.clickRate}%`} note={`Reply ${m.replyRate}% · complaints ${m.complaintRate}%`} />
    </div>

    <section className="card mt-6 overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">Sending domain health</h2><p className="mt-1 text-xs text-slate-500">DNS authentication checks are direct observations. Inbox placement for recipients you do not control remains unknown.</p></div>
      <div className="responsive-table"><table className="data-table"><thead><tr><th>Domain</th><th>Score</th><th>SPF</th><th>DKIM</th><th>DMARC</th><th>MX</th><th>Last checked</th></tr></thead><tbody>{data.domains.length ? data.domains.map((d)=><tr key={d.id}><td className="font-semibold">{d.domain}</td><td className="font-bold">{d.health_score}/100</td><td>{authBadge(d.spf_status)}</td><td>{authBadge(d.dkim_status)}</td><td>{authBadge(d.dmarc_status)}</td><td>{authBadge(d.mx_status)}</td><td className="text-xs text-slate-500">{d.last_checked_at ? new Date(d.last_checked_at).toLocaleString() : "Never"}</td></tr>) : <tr><td colSpan={7} className="text-sm text-slate-500">Run your first DNS check below.</td></tr>}</tbody></table></div>
    </section>

    <div className="mt-6"><DeliverabilityControls mailboxes={data.mailboxes} seeds={data.seeds} tests={data.tests} /></div>

    <div className="mt-6"><ProviderReputationPanel integration={provider.integration} snapshots={provider.snapshots} /></div>

    <section className="card mt-6 p-5">
      <h2 className="font-bold">What this can and cannot prove</h2>
      <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-2">
        <p><strong className="text-slate-900">Strong signals:</strong> SMTP acceptance/rejection, DSN hard bounces, replies, connected-inbox placement, SPF/MX/DMARC records, and detected DKIM selectors.</p>
        <p><strong className="text-slate-900">Estimated signals:</strong> opens, clicks, content spam risk and overall score. Security scanners, image proxies and privacy features can distort engagement events.</p>
      </div>
    </section>
  </AppShell>;
}
