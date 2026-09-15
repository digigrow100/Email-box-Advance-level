"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MailboxActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function act(action: "pause" | "resume" | "retest") {
    setBusy(action); setError("");
    try {
      const response = await fetch(`/api/mailboxes/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Action failed");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(""); }
  }

  return <div className="min-w-36"><div className="flex flex-wrap gap-1.5"><button type="button" disabled={Boolean(busy)} onClick={()=>act("retest")} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">{busy==="retest"?"Testing…":"Test"}</button>{status==="paused"?<button type="button" disabled={Boolean(busy)} onClick={()=>act("resume")} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">Resume</button>:<button type="button" disabled={Boolean(busy)} onClick={()=>act("pause")} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">Pause</button>}</div>{error&&<p className="mt-1 max-w-44 text-[10px] leading-4 text-rose-600">{error}</p>}</div>;
}
