"use client";

import { useMemo, useState } from "react";
import type { Contact, Mailbox } from "@/lib/types";

const field = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400";

export function CampaignForm({ mailboxes, contacts }: { mailboxes: Mailbox[]; contacts: Contact[] }) {
  const activeContacts = useMemo(() => contacts.filter((c: Contact) => c.status === "active" || c.status === "replied"), [contacts]);
  const [selected, setSelected] = useState<string[]>(activeContacts.slice(0, 10).map((c: Contact) => c.id));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle(id: string) { setSelected((current: string[]) => current.includes(id) ? current.filter((x: string) => x !== id) : [...current, id]); }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!selected.length) { setMessage("Select at least one active contact."); return; }
    const payload = {
      name: form.get("name"), mailboxId: form.get("mailboxId"), subject: form.get("subject"), body: form.get("body"),
      contactIds: selected, startAt: form.get("startAt"), timezone: form.get("timezone"), sendWindowStart: form.get("sendWindowStart"), sendWindowEnd: form.get("sendWindowEnd"),
    };
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") { setMessage(`Demo mode: campaign prepared for ${selected.length} contacts. Switch off demo mode to create the live queue.`); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create campaign");
      window.location.href = "/campaigns";
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create campaign"); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[1fr_.8fr]">
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-bold">Campaign details</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold sm:col-span-2">Campaign name<input name="name" required className={field} placeholder="US Local Agencies — September" /></label>
        <label className="text-sm font-semibold sm:col-span-2">Mailbox<select name="mailboxId" required className={field}>{mailboxes.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}</select></label>
        <label className="text-sm font-semibold sm:col-span-2">Subject<input name="subject" required className={field} defaultValue="Quick question about {{company}}" /></label>
        <label className="text-sm font-semibold sm:col-span-2">Email body<textarea name="body" required className={`${field} min-h-48`} defaultValue={"Hi {{first_name}},\n\nI had a quick idea for {{company}}. Would it be useful if I sent it over?\n\nBest,\n{{sender_name}}"} /></label>
        <label className="text-sm font-semibold">Start at<input name="startAt" type="datetime-local" className={field} /></label>
        <label className="text-sm font-semibold">Timezone<select name="timezone" className={field} defaultValue="America/New_York"><option>America/New_York</option><option>America/Chicago</option><option>America/Los_Angeles</option><option>Europe/London</option><option>Asia/Karachi</option></select></label>
        <label className="text-sm font-semibold">Send from<input name="sendWindowStart" type="time" defaultValue="09:00" className={field} /></label>
        <label className="text-sm font-semibold">Send until<input name="sendWindowEnd" type="time" defaultValue="16:00" className={field} /></label>
      </div>
      <button disabled={busy || !mailboxes.length} className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Create scheduled campaign"}</button>
      {message && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{message}</p>}
    </section>
    <section className="card overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold">Recipients</h2><p className="mt-1 text-xs text-slate-500">{selected.length} selected · suppressed contacts are excluded</p></div>
      <div className="max-h-[610px] divide-y divide-slate-100 overflow-auto">
        {activeContacts.map((contact: Contact) => <label key={contact.id} className="flex cursor-pointer items-start gap-3 p-4 hover:bg-slate-50"><input type="checkbox" checked={selected.includes(contact.id)} onChange={() => toggle(contact.id)} className="mt-1" /><span><span className="block text-sm font-semibold">{contact.name}</span><span className="mt-1 block text-xs text-slate-500">{contact.email} · {contact.company}</span></span></label>)}
        {!activeContacts.length && <p className="p-5 text-sm text-slate-500">Import active contacts first.</p>}
      </div>
    </section>
  </form>;
}
