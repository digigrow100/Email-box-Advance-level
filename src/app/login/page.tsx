"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createBrowserSupabaseClient();
    if (!supabase) { setMessage("Supabase is not configured. Use demo mode or add environment keys."); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message); else window.location.href = "/dashboard";
  }

  return <main className="grid min-h-screen place-items-center p-4"><form onSubmit={signIn} className="card w-full max-w-md p-6"><h1 className="text-2xl font-bold">Sign in to MailPilot</h1><p className="mt-2 text-sm text-slate-500">Use your workspace account.</p><label className="mt-6 block text-sm font-semibold">Email<input type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} required className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="mt-4 block text-sm font-semibold">Password<input type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} required className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><button className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white">Sign in</button>{message && <p className="mt-4 text-sm text-amber-700">{message}</p>}</form></main>;
}
