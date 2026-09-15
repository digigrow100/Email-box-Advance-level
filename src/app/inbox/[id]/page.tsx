import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ThreadReplyBox } from "@/components/thread-reply-box";
import { getThread } from "@/lib/data/repository";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const thread = await getThread(id);
  return <AppShell><div className="mb-5"><Link href="/inbox" className="text-sm font-semibold text-indigo-600">← Inbox</Link><h1 className="mt-3 text-2xl font-bold">{thread.subject}</h1><p className="mt-1 text-sm text-slate-500">{thread.participant} · via {thread.mailbox}</p></div>
    <div className="space-y-4">{thread.messages.map((m:any)=><article key={m.id} className={`card p-5 ${m.direction==="outbound"?"ml-auto max-w-3xl border-indigo-100 bg-indigo-50/40":"mr-auto max-w-3xl"}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">{m.direction==="outbound"?"You":m.from}{m.ai?<span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] text-violet-700">AI assisted</span>:null}</p><p className="text-xs text-slate-400">{m.time}</p></div><pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">{m.body}</pre></article>)}</div>
    <div className="mt-6"><ThreadReplyBox threadId={thread.id} mailboxId={thread.mailboxId} to={thread.participant} subject={thread.subject}/></div>
  </AppShell>;
}
