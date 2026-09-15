import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { listCampaigns } from "@/lib/data/repository";
import { Plus } from "lucide-react";

export default async function CampaignsPage() {
  const demoCampaigns = await listCampaigns();
  return (
    <AppShell>
      <PageHeader title="Campaigns" description="Create scheduled outreach while respecting mailbox limits and contact suppression rules." action={<a href="/campaigns/new" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><Plus size={16} /> New campaign</a>} />
      <div className="card responsive-table overflow-hidden">
        <table className="data-table"><thead><tr><th>Campaign</th><th>Status</th><th>Mailbox</th><th>Progress</th><th>Replies</th><th>Schedule</th></tr></thead>
          <tbody>{demoCampaigns.map((campaign) => {
            const pct = campaign.contacts ? Math.round((campaign.sent / campaign.contacts) * 100) : 0;
            return <tr key={campaign.id}><td className="font-semibold">{campaign.name}</td><td><StatusBadge status={campaign.status} /></td><td className="text-sm text-slate-600">{campaign.mailbox}</td><td><div className="min-w-40"><div className="mb-1 flex justify-between text-xs text-slate-500"><span>{campaign.sent}/{campaign.contacts}</span><span>{pct}%</span></div><div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} /></div></div></td><td className="font-semibold">{campaign.replies}</td><td className="text-xs text-slate-500">{campaign.scheduledFor}</td></tr>;
          })}</tbody>
        </table>
      </div>
      <div className="card mt-6 p-5"><h2 className="font-bold">Before every send</h2><p className="mt-2 text-sm leading-6 text-slate-500">The background worker checks the mailbox daily limit, campaign status, recipient suppression state, schedule window and duplicate-send protection before sending a message.</p></div>
    </AppShell>
  );
}
