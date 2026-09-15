"use client";
import { useState, type ChangeEvent } from "react";

export function CsvImportForm() {
  const [csv, setCsv] = useState("email,first_name,last_name,company\nolivia@example.org,Olivia,Carter,Carter Studio");
  const [message, setMessage] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") { setMessage("Demo mode: CSV looks ready. Live import is enabled after Supabase setup."); return; }
    const response = await fetch("/api/contacts/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv }) });
    const body = await response.json();
    setMessage(response.ok ? `Imported ${body.imported} contacts.` : body.error ?? "Import failed");
  }
  return <form onSubmit={submit} className="card p-5"><h2 className="font-bold">Paste CSV</h2><p className="mt-1 text-sm text-slate-500">Required column: email. Optional: first_name, last_name, company.</p><textarea value={csv} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setCsv(e.target.value)} className="mt-4 min-h-72 w-full rounded-xl border border-slate-200 p-3 font-mono text-sm" /><button className="mt-4 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">Import contacts</button>{message && <p className="mt-3 text-sm text-slate-600">{message}</p>}</form>;
}
