import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, requireEnv } from "@/lib/env";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv(env.supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv(env.supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(items: Array<{ name: string; value: string; options?: CookieOptions }>) {
          try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* Server Components may not allow setting cookies. */ }
        },
      },
    }
  );
}

export async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  return { supabase, user };
}
