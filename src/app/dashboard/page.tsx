import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { getDashboardStats, listActivity, listCampaigns, listMailboxes } from "@/lib/data/repository";
import { Inbox, MessageCircleReply, Send, ShieldCheck } from "lucide-react";

export default async function DashboardPage() {
  const [demoMailboxes, demoCampaigns, demoActivity, stats] = await Promise.all([listMailboxes(), listCampaigns(), listActivity(), getDashboardStats()]);
  const sent = demoMailboxes.reduce((sum, item) => sum + item.sentToday, 0);
  const limit = demoMailboxes.reduce((sum, item) => sum + item.dailyLimit, 0);
  const healthy = demoMailboxes.filter((m) => m.status === "healthy").length;
  const paused = demoMailboxes.filter((m) => m.status === "paused").length;

  return (
    <AppShell>
      <PageHeader title="Dashboard" description="A clear view of sending volume, mailbox health, replies and scheduled work." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Inbox} label="Connected mailboxes" value={String(demoMailboxes.length)} note={`${healthy} healthy · ${paused} paused`} />
        <StatCard icon={Send} label="Sent today" value={String(sent)} note={`${limit - sent} sends left across all mailboxes`} />
        <StatCard icon={MessageCircleReply} label="Replies this week" value={String(stats.repliesWeek)} note="Across connected mailboxes" />
        <StatCard icon={ShieldCheck} label="Suppressed contacts" value={String(stats.suppressed)} note="Bounces + opt-outs + complaints" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_.85fr]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold">Active campaigns</h2><p className="mt-0.5 text-xs text-slate-500">Current sending progress</p></div><a href="/campaigns" className="text-xs font-semibold text-indigo-600">View all</a></div>
          <div className="divide-y divide-slate-100">
            {demoCampaigns.map((campaign) => {
              const pct = campaign.contacts ? Math.round((campaign.sent / campaign.contacts) * 100) : 0;
              return <div key={campaign.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{campaign.name}</p><p className="mt-1 text-xs text-slate-500">{campaign.mailbox}</p></div><StatusBadge status={campaign.status} /></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${pct}%` }} /></div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{campaign.sent} / {campaign.contacts} sent</span><span>{campaign.replies} replies</span></div></div>;
            })}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">Recent activity</h2><p className="mt-0.5 text-xs text-slate-500">Latest mailbox events</p></div>
          <div className="divide-y divide-slate-100">
            {demoActivity.slice(0, 5).map((item) => <div key={item.id} className="px-5 py-4"><div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.type === "reply" ? "bg-indigo-500" : item.type === "bounce" || item.type === "warning" ? "bg-amber-500" : "bg-emerald-500"}`} /><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p><p className="mt-1 text-[11px] text-slate-400">{item.time}</p></div></div></div>)}
          </div>
        </section>
      </div>

      <section className="card mt-6 p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><p className="font-bold">Safe ramp is active</p><p className="mt-1 text-sm text-slate-500">MailPilot gradually increases daily limits. It does not create fake opens or automated mailbox-to-mailbox replies.</p></div>
          <a href="/mailboxes" className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">Review limits</a>
        </div>
      </section>
    </AppShell>
  );
}
