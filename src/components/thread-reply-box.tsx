"use client";

import { useState, type ChangeEvent } from "react";

export function ThreadReplyBox({ threadId, mailboxId, to, subject }: { threadId: string; mailboxId: string; to: string; subject: string }) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function aiDraft() {
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") { setBody("Thanks for the message. I can confirm the project scope and timeline. I’ll send the details shortly.\n\nBest,\nHamza"); setStatus("Demo AI draft created."); return; }
    setBusy(true); setStatus("Creating AI draft…");
    try {
      const r = await fetch("/api/ai/reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "AI draft failed");
      setBody(data.body); setStatus("AI draft ready. Review it before sending.");
    } catch (e) { setStatus(e instanceof Error ? e.message : "AI draft failed"); }
    finally { setBusy(false); }
  }

  async function submit(mode: "send" | "schedule") {
    if (!body.trim()) return setStatus("Write a reply first.");
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") { setStatus(mode === "send" ? "Demo: reply sent." : "Demo: reply scheduled for 10 minutes from now."); return; }
    setBusy(true); setStatus(mode === "send" ? "Sending…" : "Scheduling…");
    try {
      const r = await fetch("/api/messages/reply", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ threadId, mailboxId, to, subject, body, mode, scheduledAt: mode === "schedule" ? new Date(Date.now() + 10 * 60_000).toISOString() : undefined }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || "Could not save reply");
      setStatus(mode === "send" ? "Reply sent." : "Reply scheduled."); if (mode === "send") setBody("");
    } catch (e) { setStatus(e instanceof Error ? e.message : "Reply failed"); }
    finally { setBusy(false); }
  }

  return <div className="card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Reply</h3><p className="text-xs text-slate-500">To {to}</p></div><button type="button" onClick={aiDraft} disabled={busy} className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">AI draft in my tone</button></div>
    <textarea value={body} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)} rows={8} className="mt-4 w-full rounded-2xl border border-slate-200 p-4 text-sm leading-6 outline-none focus:border-indigo-400" placeholder="Write a reply…" />
    <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={() => submit("send")} disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Send now</button><button type="button" onClick={() => submit("schedule")} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Schedule +10 min</button></div>
    {status && <p className="mt-3 text-sm text-slate-500">{status}</p>}
  </div>;
}
