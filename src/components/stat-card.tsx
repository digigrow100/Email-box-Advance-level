import type { LucideIcon } from "lucide-react";

export function StatCard({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          <p className="mt-2 text-xs text-slate-500">{note}</p>
        </div>
        <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><Icon size={20} /></div>
      </div>
    </div>
  );
}
