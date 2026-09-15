"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

type Settings = {
  workspace_name: string;
  default_timezone: string;
  default_daily_limit: number;
  default_send_window_start: string;
  default_send_window_end: string;
  open_tracking_enabled?: boolean;
  click_tracking_enabled?: boolean;
};

export function SettingsForm({ initial }: { initial: Settings }) {
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        workspaceName: form.workspace_name,
        defaultTimezone: form.default_timezone,
        defaultDailyLimit: form.default_daily_limit,
        defaultSendWindowStart: form.default_send_window_start,
        defaultSendWindowEnd: form.default_send_window_end,
        openTrackingEnabled: Boolean(form.open_tracking_enabled),
        clickTrackingEnabled: Boolean(form.click_tracking_enabled),
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Save failed");
      setMessage("Settings saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed"); }
    finally { setSaving(false); }
  }

  return <form onSubmit={save} className="card p-5">
    <h2 className="font-bold">Workspace defaults</h2>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2"><span className="text-sm font-semibold">Workspace name</span><input className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" value={form.workspace_name} onChange={(e: ChangeEvent<HTMLInputElement>)=>setForm({...form,workspace_name:e.target.value})}/></label>
      <label className="block"><span className="text-sm font-semibold">Default daily limit</span><input type="number" min={1} max={50} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" value={form.default_daily_limit} onChange={(e: ChangeEvent<HTMLInputElement>)=>setForm({...form,default_daily_limit:Number(e.target.value)})}/></label>
      <label className="block"><span className="text-sm font-semibold">Default timezone</span><input className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" value={form.default_timezone} onChange={(e: ChangeEvent<HTMLInputElement>)=>setForm({...form,default_timezone:e.target.value})} placeholder="America/New_York"/></label>
      <label className="block"><span className="text-sm font-semibold">Send window start</span><input type="time" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" value={form.default_send_window_start.slice(0,5)} onChange={(e: ChangeEvent<HTMLInputElement>)=>setForm({...form,default_send_window_start:e.target.value})}/></label>
      <label className="block"><span className="text-sm font-semibold">Send window end</span><input type="time" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" value={form.default_send_window_end.slice(0,5)} onChange={(e: ChangeEvent<HTMLInputElement>)=>setForm({...form,default_send_window_end:e.target.value})}/></label>
    </div>

    <div className="mt-6 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-bold">Engagement tracking</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">Open tracking is approximate because privacy proxies and blocked images can create false positives or missed opens. Click tracking is generally stronger but security scanners can still prefetch links.</p>
      <div className="mt-4 space-y-3">
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" className="mt-1 h-4 w-4" checked={Boolean(form.open_tracking_enabled)} onChange={(e: ChangeEvent<HTMLInputElement>)=>setForm({...form,open_tracking_enabled:e.target.checked})}/><span><strong className="block text-sm">Open tracking</strong><span className="text-xs text-slate-500">Adds a 1×1 tracking pixel to outbound HTML email.</span></span></label>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" className="mt-1 h-4 w-4" checked={Boolean(form.click_tracking_enabled)} onChange={(e: ChangeEvent<HTMLInputElement>)=>setForm({...form,click_tracking_enabled:e.target.checked})}/><span><strong className="block text-sm">Click tracking</strong><span className="text-xs text-slate-500">Rewrites HTTP/HTTPS links through signed MailPilot redirect URLs.</span></span></label>
      </div>
    </div>

    <div className="mt-5 flex items-center gap-3"><button disabled={saving} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving?"Saving…":"Save settings"}</button>{message&&<span className="text-sm text-slate-600">{message}</span>}</div>
  </form>;
}
