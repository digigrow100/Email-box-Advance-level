const styles: Record<string, string> = {
  healthy: "bg-emerald-50 text-emerald-700 border-emerald-200",
  running: "bg-emerald-50 text-emerald-700 border-emerald-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  replied: "bg-indigo-50 text-indigo-700 border-indigo-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  paused: "bg-slate-100 text-slate-600 border-slate-200",
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  completed: "bg-violet-50 text-violet-700 border-violet-200",
  bounced: "bg-rose-50 text-rose-700 border-rose-200",
  error: "bg-rose-50 text-rose-700 border-rose-200",
  unsubscribed: "bg-slate-100 text-slate-500 border-slate-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${styles[status] ?? styles.paused}`}>
      {status}
    </span>
  );
}
