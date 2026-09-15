import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { listContacts } from "@/lib/data/repository";
import { Upload } from "lucide-react";

export default async function ContactsPage() {
  const demoContacts = await listContacts();
  const activeCount = demoContacts.filter((c) => c.status === "active").length;
  const repliedCount = demoContacts.filter((c) => c.status === "replied").length;
  const suppressedCount = demoContacts.filter((c) => c.status === "bounced" || c.status === "unsubscribed").length;
  return (
    <AppShell>
      <PageHeader title="Contacts" description="Import business contacts, track engagement and automatically suppress bounces or opt-outs." action={<a href="/contacts/import" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><Upload size={16} /> Import CSV</a>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3"><div className="card p-4"><p className="text-xs font-semibold uppercase text-slate-500">Active</p><p className="mt-2 text-2xl font-bold">{activeCount}</p></div><div className="card p-4"><p className="text-xs font-semibold uppercase text-slate-500">Replied</p><p className="mt-2 text-2xl font-bold">{repliedCount}</p></div><div className="card p-4"><p className="text-xs font-semibold uppercase text-slate-500">Suppressed</p><p className="mt-2 text-2xl font-bold">{suppressedCount}</p></div></div>
      <div className="card responsive-table overflow-hidden"><table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Status</th></tr></thead><tbody>{demoContacts.map((contact) => <tr key={contact.id}><td className="font-semibold">{contact.name}</td><td className="text-sm text-slate-600">{contact.email}</td><td className="text-sm text-slate-600">{contact.company}</td><td><StatusBadge status={contact.status} /></td></tr>)}</tbody></table></div>
    </AppShell>
  );
}
