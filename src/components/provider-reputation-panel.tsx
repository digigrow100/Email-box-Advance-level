"use client";

import { useState } from "react";

type ProviderIntegration = {
  id: string;
  provider: string;
  account_email?: string | null;
  status: string;
  last_sync_at?: string | null;
  metadata?: Record<string, unknown> | null;
} | null;

type ProviderSnapshot = {
  id: string;
  provider: string;
  period_start: string;
  period_end: string;
  spam_rate: number | null;
  delivery_error_rate: number | null;
  spf_success_rate: number | null;
  dkim_success_rate: number | null;
  dmarc_success_rate: number | null;
  tls_rate: number | null;
  compliance?: Record<string, unknown> | null;
  created_at: string;
  deliverability_domains?: { domain?: string } | { domain?: string }[] | null;
};

function joinedDomain(value: ProviderSnapshot["deliverability_domains"]): string | undefined {
  return Array.isArray(value) ? value[0]?.domain : value?.domain;
}

export function ProviderReputationPanel({ integration, snapshots }: { integration: ProviderIntegration; snapshots: ProviderSnapshot[] }) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  async function sync() {
    setSyncing(true); setMessage("");
    try {
      const response = await fetch("/api/deliverability/google/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sync failed");
      setMessage(`Synced ${data.synced}/${data.domains} Postmaster domain(s).`);
      setTimeout(()=>window.location.reload(), 700);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sync failed"); }
    finally { setSyncing(false); }
  }
  const latestByDomain = new Map<string, ProviderSnapshot>();
  for (const row of snapshots) {
    const domain = joinedDomain(row.deliverability_domains) || "domain";
    if (!latestByDomain.has(domain)) latestByDomain.set(domain, row);
  }
  return <section className="card p-5">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><h2 className="font-bold">Google Postmaster reputation</h2><p className="mt-1 text-xs leading-5 text-slate-500">Optional Gmail-side metrics for verified sending domains: spam rate, delivery errors, authentication success, TLS and compliance.</p></div>
      {integration ? <button type="button" onClick={sync} disabled={syncing} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-50">{syncing ? "Syncing…" : "Sync now"}</button> : <a href="/api/deliverability/google/connect" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Connect Postmaster</a>}
    </div>
    {integration && <p className="mt-3 text-xs text-slate-500">Connected as {integration.account_email || "Google account"}{integration.last_sync_at ? ` · Last sync ${new Date(integration.last_sync_at).toLocaleString()}` : ""}</p>}
    {message && <p className="mt-3 text-xs text-slate-600">{message}</p>}
    <div className="mt-4 grid gap-3 md:grid-cols-2">{[...latestByDomain.entries()].map(([domain,row])=><div key={domain} className="rounded-xl border border-slate-200 p-4"><div className="font-semibold">{domain}</div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600"><span>Spam rate</span><strong className="text-right text-slate-900">{row.spam_rate == null ? "—" : `${(Number(row.spam_rate)*100).toFixed(3)}%`}</strong><span>Delivery errors</span><strong className="text-right text-slate-900">{row.delivery_error_rate == null ? "—" : `${(Number(row.delivery_error_rate)*100).toFixed(2)}%`}</strong><span>SPF success</span><strong className="text-right text-slate-900">{row.spf_success_rate == null ? "—" : `${(Number(row.spf_success_rate)*100).toFixed(1)}%`}</strong><span>DKIM success</span><strong className="text-right text-slate-900">{row.dkim_success_rate == null ? "—" : `${(Number(row.dkim_success_rate)*100).toFixed(1)}%`}</strong><span>DMARC success</span><strong className="text-right text-slate-900">{row.dmarc_success_rate == null ? "—" : `${(Number(row.dmarc_success_rate)*100).toFixed(1)}%`}</strong><span>TLS</span><strong className="text-right text-slate-900">{row.tls_rate == null ? "—" : `${(Number(row.tls_rate)*100).toFixed(1)}%`}</strong></div></div>)}</div>
    {!integration && <p className="mt-4 text-xs text-slate-500">This is optional. Your generic IMAP/SMTP deliverability checks work without Google.</p>}
  </section>;
}
