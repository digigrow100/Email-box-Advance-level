"use client";
import { useState } from "react";

export function ComposeForm({ mailboxes }: { mailboxes: Array<{ id: string; email: string }> }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function submitForm(form: HTMLFormElement, mode: "send" | "schedule") {
    const f = new FormData(form);
    const payload = { mailboxId: f.get("mailboxId"), to: String(f.get("to") || "").split(",").map(v=>v.trim()).filter(Boolean), cc: String(f.get("cc") || "").split(",").map(v=>v.trim()).filter(Boolean), subject: f.get("subject"), body: f.get("body"), mode, scheduledAt: mode === "schedule" ? f.get("scheduledAt") : undefined };
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") return setStatus(mode === "send" ? "Demo: message sent." : "Demo: message scheduled.");
    setBusy(true); setStatus(mode === "send" ? "Sending…" : "Scheduling…");
    try { const r = await fetch("/api/messages/compose", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(payload) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Message failed"); setStatus(mode === "send" ? "Message sent." : "Message scheduled."); }
    catch (e) { setStatus(e instanceof Error ? e.message : "Message failed"); } finally { setBusy(false); }
  }
  return <form className="card max-w-4xl p-5 sm:p-6">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">From<select name="mailboxId" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5">{mailboxes.map(m=><option key={m.id} value={m.id}>{m.email}</option>)}</select></label>
      <label className="text-sm font-semibold">To<input name="to" required className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5" placeholder="client@example.com" /></label>
      <label className="text-sm font-semibold sm:col-span-2">Cc<input name="cc" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5" placeholder="Optional, comma separated" /></label>
      <label className="text-sm font-semibold sm:col-span-2">Subject<input name="subject" required className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
      <label className="text-sm font-semibold sm:col-span-2">Message<textarea name="body" required rows={12} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 leading-6" /></label>
      <label className="text-sm font-semibold">Schedule time<input name="scheduledAt" type="datetime-local" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
    </div>
    <div className="mt-5 flex flex-wrap gap-2"><button disabled={busy} onClick={(e: any)=>{e.preventDefault(); if(e.currentTarget.form) submitForm(e.currentTarget.form, "send")}} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">Send now</button><button disabled={busy} onClick={(e: any)=>{e.preventDefault(); if(e.currentTarget.form) submitForm(e.currentTarget.form, "schedule")}} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Schedule</button></div>
    {status && <p className="mt-3 text-sm text-slate-500">{status}</p>}
  </form>;
}
