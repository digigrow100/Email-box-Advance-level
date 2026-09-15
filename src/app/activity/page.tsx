import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { listActivity } from "@/lib/data/repository";

export default async function ActivityPage() {
  const demoActivity = await listActivity();
  return <AppShell><PageHeader title="Activity" description="A chronological log of sends, replies, bounces, mailbox syncs and warnings." /><section className="card overflow-hidden"><div className="divide-y divide-slate-100">{demoActivity.map((item) => <div key={item.id} className="flex items-start justify-between gap-4 p-5"><div className="flex items-start gap-3"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.type === "reply" ? "bg-indigo-500" : item.type === "bounce" || item.type === "warning" ? "bg-amber-500" : "bg-emerald-500"}`} /><div><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-slate-500">{item.detail}</p></div></div><span className="shrink-0 text-xs text-slate-400">{item.time}</span></div>)}</div></section></AppShell>;
}
