import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { listMailboxes } from "@/lib/data/repository";
import { Plus, ShieldCheck } from "lucide-react";
import { MailboxActions } from "@/components/mailbox-actions";

export default async function MailboxesPage() {
  const demoMailboxes = await listMailboxes();
  return (
    <AppShell>
      <PageHeader
        title="Mailboxes"
        description="Connect Gmail or any professional mailbox that provides IMAP and SMTP access."
        action={<a href="/mailboxes/new" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><Plus size={16} /> Connect mailbox</a>}
      />

      <div className="card mb-5 flex items-start gap-3 border-indigo-100 bg-indigo-50/60 p-4">
        <ShieldCheck size={19} className="mt-0.5 shrink-0 text-indigo-600" />
        <div><p className="text-sm font-semibold text-slate-900">Credentials stay server-side</p><p className="mt-1 text-xs leading-5 text-slate-600">Custom mailbox passwords and Gmail refresh tokens are encrypted before storage. Use app passwords whenever your provider supports them.</p></div>
      </div>

      <div className="card responsive-table overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Mailbox</th><th>Provider</th><th>Status</th><th>Daily limit</th><th>Today</th><th>Ramp</th><th>Reply rate</th><th>Last sync</th><th>Actions</th></tr></thead>
          <tbody>
            {demoMailboxes.map((mailbox) => (
              <tr key={mailbox.id}>
                <td><div className="font-semibold text-slate-900">{mailbox.name}</div><div className="mt-1 text-xs text-slate-500">{mailbox.email}</div></td>
                <td className="capitalize text-sm text-slate-600">{mailbox.provider === "gmail" ? "Gmail OAuth" : "IMAP + SMTP"}</td>
                <td><StatusBadge status={mailbox.status} /></td>
                <td className="text-sm font-semibold">{mailbox.dailyLimit}/day</td>
                <td><div className="w-28"><div className="mb-1 flex justify-between text-[11px] text-slate-500"><span>{mailbox.sentToday}</span><span>{mailbox.dailyLimit}</span></div><div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, (mailbox.sentToday / mailbox.dailyLimit) * 100)}%` }} /></div></div></td>
                <td className="text-sm text-slate-600">Day {mailbox.rampDay}</td>
                <td className="text-sm font-semibold">{mailbox.replyRate}%</td>
                <td className="text-xs text-slate-500">{mailbox.lastSync}</td>
                <td><MailboxActions id={mailbox.id} status={mailbox.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-5"><h2 className="font-bold">Connect Gmail</h2><p className="mt-2 text-sm leading-6 text-slate-500">Use Google OAuth. The app stores an encrypted refresh token and can use OAuth2 for Gmail sending and inbox access.</p><a href="/api/gmail/connect" className="mt-4 inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Connect with Google</a></section>
        <section className="card p-5"><h2 className="font-bold">Connect professional email</h2><p className="mt-2 text-sm leading-6 text-slate-500">Enter your provider's IMAP and SMTP host, ports, mailbox address and app password. Hostinger, cPanel and many other providers work this way.</p><a href="/mailboxes/new" className="mt-4 inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Open connection form</a></section>
      </div>
    </AppShell>
  );
}
