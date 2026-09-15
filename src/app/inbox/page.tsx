import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { listThreads } from "@/lib/data/repository";
import { RefreshCw, SquarePen } from "lucide-react";

export default async function InboxPage() {
  const threads = await listThreads();
  return <AppShell><PageHeader title="Unified inbox" description="Read Gmail and professional mailboxes in one place." action={<div className="flex gap-2"><form action="/api/inbox/sync" method="post"><button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"><RefreshCw size={15} className="mr-2 inline"/>Sync</button></form><Link href="/compose" className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"><SquarePen size={15} className="mr-2 inline"/>Compose</Link></div>} />
    <div className="card overflow-hidden">{threads.map((t)=><Link key={t.id} href={`/inbox/${t.id}`} className="grid gap-2 border-b border-slate-100 p-4 hover:bg-slate-50 sm:grid-cols-[190px_1fr_110px] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-semibold">{t.participant}</p><p className="truncate text-xs text-slate-400">{t.mailbox}</p></div><div className="min-w-0"><div className="flex items-center gap-2"><p className={`truncate text-sm ${t.unread ? "font-bold" : "font-semibold"}`}>{t.subject}</p>{t.unread ? <span className="h-2 w-2 rounded-full bg-indigo-600"/>:null}</div><p className="mt-1 truncate text-xs text-slate-500">{t.preview}</p></div><p className="text-xs text-slate-400 sm:text-right">{t.time}</p></Link>)}{!threads.length&&<p className="p-8 text-center text-sm text-slate-500">No messages yet. Sync a mailbox to begin.</p>}</div>
  </AppShell>;
}
