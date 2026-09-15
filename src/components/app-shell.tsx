"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  BookOpenText,
  ContactRound,
  Gauge,
  Inbox,
  MailPlus,
  Clock3,
  Workflow,
  TrendingUp,
  Menu,
  Send,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/inbox", label: "Unified Inbox", icon: Inbox },
  { href: "/mailboxes", label: "Mailboxes", icon: MailPlus },
  { href: "/warmup", label: "Sending Ramp", icon: TrendingUp },
  { href: "/deliverability", label: "Deliverability", icon: ShieldCheck },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/contacts", label: "Contacts", icon: ContactRound },
  { href: "/templates", label: "Templates", icon: BookOpenText },
  { href: "/scheduled", label: "Drafts & Scheduled", icon: Clock3 },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/ai", label: "AI & Tone", icon: Bot },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white"><MailPlus size={19} /></span>
            <span><strong className="block text-base leading-none">MailPilot</strong><span className="text-[11px] text-slate-500">Email operations</span></span>
          </Link>
          <button type="button" className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={19} /></button>
        </div>
        <nav className="space-y-1 p-3">
          {nav.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
                <Icon size={18} />{item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-4 left-3 right-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{demoMode ? "Demo mode" : "Live mode"}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{demoMode ? "Sample data is active. Disable demo mode before production." : "Live mailbox data and background jobs are enabled."}</p>
        </div>
      </aside>

      {open && <button className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation overlay" />}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-lg border border-slate-200 p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
            <div><p className="text-sm font-semibold">MailPilot</p><p className="text-xs text-slate-500">Workspace</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:block">System healthy</div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">HM</div>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
