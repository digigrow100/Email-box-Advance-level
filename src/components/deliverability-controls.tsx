"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type { ContentRisk } from "@/lib/deliverability/content";

type Mailbox = { id: string; email: string; provider: string; status: string };
type MailboxJoin = { email?: string } | { email?: string }[] | null | undefined;
function joinedEmail(value: MailboxJoin): string | undefined {
  return Array.isArray(value) ? value[0]?.email : value?.email;
}
type SeedInboxJoin = { label?: string; provider_hint?: string } | { label?: string; provider_hint?: string }[] | null | undefined;
type Seed = { id: string; mailbox_id: string; label: string; provider_hint: string; mailboxes?: MailboxJoin };
type PlacementResult = { id: string; recipient_email: string; placement: string; matched_folder?: string | null; details?: { authentication?: { spf?: string; dkim?: string; dmarc?: string } | null } | null; seed_inboxes?: SeedInboxJoin };
type PlacementTest = { id: string; marker: string; subject: string; status: string; created_at: string; mailboxes?: MailboxJoin; placement_results?: PlacementResult[] };

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function DeliverabilityControls({ mailboxes, seeds, tests }: { mailboxes: Mailbox[]; seeds: Seed[]; tests: PlacementTest[] }) {
  const domains = useMemo(() => [...new Set(mailboxes.map((m) => m.email.split("@")[1]).filter(Boolean))], [mailboxes]);
  const [domain, setDomain] = useState(domains[0] || "");
  const [selectors, setSelectors] = useState("default, google, selector1, selector2");
  const [domainMessage, setDomainMessage] = useState("");
  const [domainBusy, setDomainBusy] = useState(false);
  const [subject, setSubject] = useState("Quick question about your business");
  const [body, setBody] = useState("Hi there,\n\nI had a quick idea that may be useful for your business. Would you like me to send a short breakdown?\n\nBest regards");
  const [risk, setRisk] = useState<(ContentRisk & { error?: undefined }) | { error: string } | null>(null);
  const [riskBusy, setRiskBusy] = useState(false);
  const [seedMailboxId, setSeedMailboxId] = useState(mailboxes.find((m) => !seeds.some((s) => s.mailbox_id === m.id))?.id || mailboxes[0]?.id || "");
  const [seedMessage, setSeedMessage] = useState("");
  const [sourceMailboxId, setSourceMailboxId] = useState(mailboxes.find((m) => !seeds.some((s) => s.mailbox_id === m.id))?.id || mailboxes[0]?.id || "");
  const [placementMessage, setPlacementMessage] = useState("");
  const [placementBusy, setPlacementBusy] = useState(false);

  async function runDomainCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setDomainBusy(true); setDomainMessage("");
    try {
      const data = await postJson("/api/deliverability/domain-check", { domain, selectors: selectors.split(",").map((s: string) => s.trim()).filter(Boolean) });
      setDomainMessage(`Score ${data.result.score}/100 — ${data.result.summary.join(" ")}`);
      setTimeout(() => window.location.reload(), 800);
    } catch (error) { setDomainMessage(error instanceof Error ? error.message : "Check failed"); }
    finally { setDomainBusy(false); }
  }

  async function analyzeContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setRiskBusy(true);
    try { setRisk((await postJson("/api/deliverability/content-check", { subject, body })).result); }
    catch (error) { setRisk({ error: error instanceof Error ? error.message : "Analysis failed" }); }
    finally { setRiskBusy(false); }
  }

  async function addSeed() {
    setSeedMessage("");
    try { await postJson("/api/deliverability/seeds", { action: "add", mailboxId: seedMailboxId }); setSeedMessage("Seed inbox added."); setTimeout(() => window.location.reload(), 500); }
    catch (error) { setSeedMessage(error instanceof Error ? error.message : "Could not add seed"); }
  }

  async function removeSeed(mailboxId: string) {
    try { await postJson("/api/deliverability/seeds", { action: "remove", mailboxId }); window.location.reload(); }
    catch (error) { setSeedMessage(error instanceof Error ? error.message : "Could not remove seed"); }
  }

  async function startPlacement() {
    setPlacementBusy(true); setPlacementMessage("");
    try { const data = await postJson("/api/deliverability/placement", { action: "start", sourceMailboxId }); setPlacementMessage(`Test ${data.marker} sent. Check results after the messages have had time to arrive.`); setTimeout(() => window.location.reload(), 700); }
    catch (error) { setPlacementMessage(error instanceof Error ? error.message : "Could not start test"); }
    finally { setPlacementBusy(false); }
  }

  async function checkPlacement(testId: string) {
    setPlacementBusy(true); setPlacementMessage("");
    try { const data = await postJson("/api/deliverability/placement", { action: "check", testId }); setPlacementMessage(`Placement scan finished: ${data.found}/${data.total} found.`); setTimeout(() => window.location.reload(), 500); }
    catch (error) { setPlacementMessage(error instanceof Error ? error.message : "Could not check placement"); }
    finally { setPlacementBusy(false); }
  }

  return <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-2">
      <form onSubmit={runDomainCheck} className="card p-5">
        <h2 className="font-bold">Domain authentication check</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">Checks MX, SPF, DMARC and the DKIM selectors you provide. A missing DKIM result can simply mean a different selector is in use.</p>
        <label className="mt-4 block"><span className="text-sm font-semibold">Sending domain</span><select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" value={domain} onChange={(e: ChangeEvent<HTMLSelectElement>)=>setDomain(e.target.value)}>{domains.map((d: string)=><option key={d} value={d}>{d}</option>)}</select></label>
        <label className="mt-4 block"><span className="text-sm font-semibold">DKIM selectors</span><input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={selectors} onChange={(e: ChangeEvent<HTMLInputElement>)=>setSelectors(e.target.value)} placeholder="default, google, selector1"/></label>
        <button disabled={!domain || domainBusy} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{domainBusy ? "Checking…" : "Run DNS check"}</button>
        {domainMessage && <p className="mt-3 text-xs leading-5 text-slate-600">{domainMessage}</p>}
      </form>

      <form onSubmit={analyzeContent} className="card p-5">
        <h2 className="font-bold">Spam-risk content analyzer</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">Local heuristics only. This does not claim to predict a recipient&apos;s spam folder with certainty.</p>
        <label className="mt-4 block"><span className="text-sm font-semibold">Subject</span><input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={subject} onChange={(e: ChangeEvent<HTMLInputElement>)=>setSubject(e.target.value)}/></label>
        <label className="mt-4 block"><span className="text-sm font-semibold">Body</span><textarea rows={5} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={body} onChange={(e: ChangeEvent<HTMLTextAreaElement>)=>setBody(e.target.value)}/></label>
        <button disabled={riskBusy} className="mt-4 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">{riskBusy ? "Analyzing…" : "Analyze content"}</button>
        {risk && "risk" in risk && <div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="flex items-center justify-between"><strong className="text-sm capitalize">{risk.risk} risk</strong><span className="text-sm font-bold">{risk.score}/100 risk points</span></div><ul className="mt-3 space-y-1 text-xs leading-5 text-slate-600">{risk.findings?.map((f,i)=><li key={i}>• {f.message}</li>)}</ul></div>}
        {risk?.error && <p className="mt-3 text-xs text-rose-600">{risk.error}</p>}
      </form>
    </div>

    <section className="card p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h2 className="font-bold">Seed inboxes</h2><p className="mt-1 text-xs leading-5 text-slate-500">Use connected test mailboxes to measure real Inbox / Spam / Other placement. MailPilot can only inspect folders in inboxes you control.</p></div><div className="flex flex-wrap gap-2"><select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={seedMailboxId} onChange={(e: ChangeEvent<HTMLSelectElement>)=>setSeedMailboxId(e.target.value)}>{mailboxes.map((m)=><option key={m.id} value={m.id}>{m.email}</option>)}</select><button type="button" onClick={addSeed} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Add seed</button></div></div>
      {seedMessage && <p className="mt-3 text-xs text-slate-600">{seedMessage}</p>}
      <div className="mt-4 flex flex-wrap gap-2">{seeds.length ? seeds.map((s)=><div key={s.id} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs"><span className="font-semibold">{joinedEmail(s.mailboxes) || s.label}</span><span className="text-slate-400">{s.provider_hint}</span><button type="button" onClick={()=>removeSeed(s.mailbox_id)} className="font-bold text-rose-600">×</button></div>) : <p className="text-sm text-slate-500">No seed inboxes yet.</p>}</div>
    </section>

    <section className="card p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h2 className="font-bold">Inbox placement tests</h2><p className="mt-1 text-xs leading-5 text-slate-500">Send a uniquely marked test from one mailbox to your seed inboxes, then scan those inboxes to see where it landed.</p></div><div className="flex flex-wrap gap-2"><select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={sourceMailboxId} onChange={(e: ChangeEvent<HTMLSelectElement>)=>setSourceMailboxId(e.target.value)}>{mailboxes.map((m)=><option key={m.id} value={m.id}>{m.email}</option>)}</select><button type="button" disabled={placementBusy || seeds.length===0} onClick={startPlacement} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Run placement test</button></div></div>
      {placementMessage && <p className="mt-3 text-xs text-slate-600">{placementMessage}</p>}
      <div className="mt-5 space-y-3">{tests.length ? tests.map((test)=><div key={test.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold">{test.marker}</div><div className="mt-1 text-xs text-slate-500">From {joinedEmail(test.mailboxes) || "mailbox"} · {new Date(test.created_at).toLocaleString()}</div></div><button type="button" onClick={()=>checkPlacement(test.id)} disabled={placementBusy} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold">Check folders</button></div><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{(test.placement_results || []).map((result)=><div key={result.id} className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-semibold">{result.recipient_email}</div><div className={`mt-1 text-xs font-bold capitalize ${result.placement === "inbox" ? "text-emerald-700" : result.placement === "spam" ? "text-rose-700" : "text-amber-700"}`}>{result.placement.replace("_", " ")}</div>{result.matched_folder && <div className="mt-1 text-[11px] text-slate-400">{result.matched_folder}</div>}{result.details?.authentication && <div className="mt-2 text-[11px] text-slate-500">SPF {result.details.authentication.spf || "—"} · DKIM {result.details.authentication.dkim || "—"} · DMARC {result.details.authentication.dmarc || "—"}</div>}</div>)}</div></div>) : <p className="text-sm text-slate-500">No placement tests yet.</p>}</div>
    </section>
  </div>;
}
