import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, productionEnvProblems } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configProblems = productionEnvProblems();
  if (configProblems.length) {
    return NextResponse.json({ status: "misconfigured", checks: { config: false, database: false }, problems: configProblems }, { status: 503 });
  }
  if (env.demoMode) return NextResponse.json({ status: "ok", mode: "demo", checks: { config: true, database: "skipped" } });
  try {
    const db = createAdminClient();
    const { error } = await db.from("workspace_settings").select("user_id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    return NextResponse.json({ status: "ok", mode: "live", checks: { config: true, database: true } });
  } catch {
    return NextResponse.json({ status: "degraded", checks: { config: true, database: false } }, { status: 503 });
  }
}
