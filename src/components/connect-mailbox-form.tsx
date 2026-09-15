"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const field = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400";

export function ConnectMailboxForm() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      displayName: form.get("displayName"), email: form.get("email"), password: form.get("password"),
      imapHost: form.get("imapHost"), imapPort: Number(form.get("imapPort")), imapSecure: form.get("imapSecure") === "on",
      smtpHost: form.get("smtpHost"), smtpPort: Number(form.get("smtpPort")), smtpSecure: form.get("smtpSecure") === "on",
      targetDailyLimit: Number(form.get("targetDailyLimit")),
    };
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
      setStatus("Demo mode: form validated locally. Set DEMO_MODE=false and configure Supabase to save real mailboxes.");
      return;
    }
    setBusy(true); setStatus("Testing IMAP and SMTP…");
    try {
      const test = await fetch("/api/mailboxes/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const testBody = await test.json();
      if (!test.ok) throw new Error(testBody.error || testBody.imapError || testBody.smtpError || "Connection test failed");
      setStatus("Connection works. Saving mailbox…");
      const save = await fetch("/api/mailboxes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const saveBody = await save.json();
      if (!save.ok) throw new Error(saveBody.error || "Could not save mailbox");
      router.push("/mailboxes");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Connection failed"); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-5 xl:grid-cols-[1fr_.7fr]">
    <form onSubmit={submit} className="card p-5 sm:p-6">
      <h2 className="text-lg font-bold">Professional mailbox</h2>
      <p className="mt-1 text-sm text-slate-500">Works with Hostinger, cPanel and other providers that expose IMAP and SMTP.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Display name<input name="displayName" className={field} placeholder="Hamza" /></label>
        <label className="text-sm font-semibold">Email<input name="email" type="email" required className={field} placeholder="hamza@company.com" /></label>
        <label className="text-sm font-semibold sm:col-span-2">App password / mailbox password<input name="password" type="password" required className={field} /></label>
        <label className="text-sm font-semibold">IMAP host<input name="imapHost" required className={field} placeholder="imap.hostinger.com" /></label>
        <label className="text-sm font-semibold">IMAP port<input name="imapPort" type="number" defaultValue="993" required className={field} /></label>
        <label className="text-sm font-semibold">SMTP host<input name="smtpHost" required className={field} placeholder="smtp.hostinger.com" /></label>
        <label className="text-sm font-semibold">SMTP port<input name="smtpPort" type="number" defaultValue="465" required className={field} /></label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input name="imapSecure" type="checkbox" defaultChecked /> Secure IMAP</label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input name="smtpSecure" type="checkbox" defaultChecked /> Secure SMTP</label>
        <label className="text-sm font-semibold">Target daily limit<input name="targetDailyLimit" type="number" min="5" max="50" defaultValue="30" className={field} /></label>
      </div>
      <button disabled={busy} className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Checking…" : "Test & connect"}</button>
      {status && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{status}</p>}
    </form>
    <aside className="space-y-5">
      <section className="card p-5"><h2 className="font-bold">Gmail</h2><p className="mt-2 text-sm leading-6 text-slate-500">For Gmail, use OAuth instead of entering your Google password.</p><a href="/api/gmail/connect" className="mt-4 inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Connect Gmail with Google</a></section>
      <section className="card p-5"><h2 className="font-bold">Security</h2><p className="mt-2 text-sm leading-6 text-slate-500">Passwords and refresh tokens are encrypted with AES-256-GCM before database storage. Prefer provider app passwords where available.</p></section>
    </aside>
  </div>;
}
