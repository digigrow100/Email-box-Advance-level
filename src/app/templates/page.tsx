import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Plus } from "lucide-react";
import { listTemplates } from "@/lib/data/repository";

export default async function TemplatesPage() {
  const templates = await listTemplates();
  return <AppShell><PageHeader title="Templates" description="Reusable copy with simple personalization variables." action={<a href="/templates/new" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><Plus size={16} /> New template</a>} /><div className="grid gap-4 lg:grid-cols-3">{templates.map((t: { id: string; name: string; subject: string; body: string }) => <article key={t.id} className="card p-5"><p className="text-xs font-semibold uppercase text-indigo-600">Email template</p><h2 className="mt-2 font-bold">{t.name}</h2><p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{t.subject}</p><p className="mt-4 line-clamp-3 whitespace-pre-line text-xs leading-5 text-slate-500">{t.body}</p></article>)}</div><div className="card mt-6 p-5"><h2 className="font-bold">Supported variables</h2><p className="mt-2 text-sm text-slate-500">{`{{first_name}}, {{last_name}}, {{company}}, {{email}}, {{sender_name}}`}</p></div></AppShell>;
}
