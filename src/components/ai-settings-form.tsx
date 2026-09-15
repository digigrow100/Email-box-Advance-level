"use client";
import { useState } from "react";

type AiSettings = {
  reply_mode?: string;
  max_auto_replies_per_day?: number;
  max_ai_drafts_per_day?: number;
  auto_reply_delay_minutes?: number;
  timezone?: string;
  business_hours_start?: string;
  business_hours_end?: string;
  require_known_contact?: boolean;
};

export function AiSettingsForm({ initial = {} }: { initial?: AiSettings }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      replyMode: f.get("replyMode"),
      maxAutoRepliesPerDay: Number(f.get("maxAutoRepliesPerDay")),
      maxAiDraftsPerDay: Number(f.get("maxAiDraftsPerDay")),
      autoReplyDelayMinutes: Number(f.get("autoReplyDelayMinutes")),
      timezone: f.get("timezone"),
      businessHoursStart: f.get("businessHoursStart"),
      businessHoursEnd: f.get("businessHoursEnd"),
      requireKnownContact: f.get("requireKnownContact") === "on",
    };
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") return setMsg("Demo: AI controls saved.");
    setBusy(true);
    try {
      const r = await fetch("/api/ai/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Save failed");
      setMsg("AI controls saved.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }
  const c = "mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm";
  const start = String(initial.business_hours_start ?? "09:00").slice(0, 5);
  const end = String(initial.business_hours_end ?? "18:00").slice(0, 5);
  return <form onSubmit={submit} className="card p-5">
    <h2 className="font-bold">AI automation controls</h2>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Default mode<select name="replyMode" defaultValue={initial.reply_mode ?? "draft"} className={c}><option value="off">Off</option><option value="draft">Draft only</option><option value="auto_send">Auto-send</option></select></label>
      <label className="text-sm font-semibold">Max AI auto-replies/day<input name="maxAutoRepliesPerDay" type="number" min="0" max="100" defaultValue={initial.max_auto_replies_per_day ?? 10} className={c}/></label>
      <label className="text-sm font-semibold">Max AI drafts/day<input name="maxAiDraftsPerDay" type="number" min="0" max="500" defaultValue={initial.max_ai_drafts_per_day ?? 50} className={c}/></label>
      <label className="text-sm font-semibold">Default delay (minutes)<input name="autoReplyDelayMinutes" type="number" min="0" max="1440" defaultValue={initial.auto_reply_delay_minutes ?? 5} className={c}/></label>
      <label className="text-sm font-semibold">Timezone<input name="timezone" defaultValue={initial.timezone ?? "UTC"} className={c}/></label>
      <label className="text-sm font-semibold">Business hours start<input name="businessHoursStart" type="time" defaultValue={start} className={c}/></label>
      <label className="text-sm font-semibold">Business hours end<input name="businessHoursEnd" type="time" defaultValue={end} className={c}/></label>
      <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input name="requireKnownContact" type="checkbox" defaultChecked={initial.require_known_contact !== false}/> By default, restrict automatic AI replies to known contacts</label>
    </div>
    <button disabled={busy} className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Save controls</button>
    {msg && <p className="mt-3 text-sm text-slate-500">{msg}</p>}
  </form>;
}
