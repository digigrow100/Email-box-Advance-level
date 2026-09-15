"use client";
import { useState } from "react";

export function TemplateForm() {
  const [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = { name: form.get("name"), subject: form.get("subject"), body: form.get("body") };
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") { setMessage("Demo mode: template is ready. Live saving is enabled after Supabase setup."); return; }
    const response = await fetch("/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (response.ok) window.location.href = "/templates"; else setMessage(body.error ?? "Could not save template");
  }
  return <form onSubmit={submit} className="card max-w-3xl p-5 sm:p-6"><label className="block text-sm font-semibold">Template name<input name="name" required className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" placeholder="Website improvement" /></label><label className="mt-4 block text-sm font-semibold">Subject<input name="subject" required className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" defaultValue="A small idea for {{company}}" /></label><label className="mt-4 block text-sm font-semibold">Body<textarea name="body" required className="mt-2 min-h-64 w-full rounded-xl border border-slate-200 p-3" defaultValue={"Hi {{first_name}},\n\nI noticed a small opportunity for {{company}}."} /></label><button className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">Save template</button>{message && <p className="mt-3 text-sm text-slate-600">{message}</p>}</form>;
}
