import { NextResponse } from "next/server";
import { checkDomainAuthentication } from "@/lib/deliverability/dns";
import { requireUser } from "@/lib/supabase/server";
import { boundedText, jsonBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await jsonBody(request, 20_000);
    const domain = boundedText(body.domain, "Domain", 255).toLowerCase();
    const selectors = Array.isArray(body.selectors) ? body.selectors.map((x: unknown) => String(x).trim().slice(0, 63)).filter(Boolean).slice(0, 12) : [];
    const result = await checkDomainAuthentication(domain, selectors);
    const { data: row, error } = await supabase.from("deliverability_domains").upsert({
      user_id: user.id,
      domain: result.domain,
      dkim_selectors: selectors,
      health_score: result.score,
      spf_status: result.statuses.spf,
      dkim_status: result.statuses.dkim,
      dmarc_status: result.statuses.dmarc,
      mx_status: result.statuses.mx,
      details: result.details,
      last_checked_at: new Date().toISOString(),
    }, { onConflict: "user_id,domain" }).select("id").single();
    if (error) throw error;
    await supabase.from("deliverability_checks").insert({
      user_id: user.id,
      domain_id: row.id,
      check_type: "dns",
      status: result.score >= 80 ? "pass" : result.score >= 50 ? "warning" : "fail",
      score: result.score,
      summary: result.summary.join(" "),
      details: result.details,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Domain check failed" }, { status: 400 });
  }
}
