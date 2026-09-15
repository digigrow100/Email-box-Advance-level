import { NextResponse } from "next/server";
import { decryptJson } from "@/lib/crypto";
import { getPostmasterCompliance, listPostmasterDomains, queryPostmasterMetrics, refreshPostmasterToken } from "@/lib/deliverability/google-postmaster";
import { requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

function num(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : null; }

export async function POST() {
  try {
    const { supabase, user } = await requireUser();
    const { data: integration, error } = await supabase.from("provider_integrations").select("*").eq("user_id", user.id).eq("provider", "google_postmaster").single();
    if (error || !integration) throw new Error("Google Postmaster is not connected");
    const secret = decryptJson<{ refreshToken?: string }>(integration.credential_blob);
    if (!secret.refreshToken) throw new Error("Postmaster refresh token is missing");
    const access = (await refreshPostmasterToken(secret.refreshToken)).access_token;
    const domains = await listPostmasterDomains(access);
    let synced = 0;
    const errors: string[] = [];
    for (const item of domains) {
      const domain = item.name.replace(/^domains\//, "");
      try {
        const [compliance, stats] = await Promise.all([getPostmasterCompliance(access, domain), queryPostmasterMetrics(access, domain, 7)]);
        const { data: domainRow, error: domainError } = await supabase.from("deliverability_domains").upsert({ user_id: user.id, domain }, { onConflict: "user_id,domain" }).select("id").single();
        if (domainError) throw domainError;
        await supabase.from("provider_reputation_snapshots").insert({
          user_id: user.id, domain_id: domainRow.id, provider: "google_postmaster",
          period_start: stats.start.toISOString().slice(0,10), period_end: stats.end.toISOString().slice(0,10),
          spam_rate: num(stats.metrics.spam_rate), delivery_error_rate: num(stats.metrics.delivery_error_rate),
          spf_success_rate: num(stats.metrics.spf_success), dkim_success_rate: num(stats.metrics.dkim_success), dmarc_success_rate: num(stats.metrics.dmarc_success), tls_rate: num(stats.metrics.tls_rate),
          compliance, raw_metrics: stats.raw,
        });
        synced++;
      } catch (e) { errors.push(`${domain}: ${e instanceof Error ? e.message : "sync failed"}`); }
    }
    await supabase.from("provider_integrations").update({ last_sync_at: new Date().toISOString(), status: errors.length && !synced ? "error" : "connected", metadata: { lastErrors: errors.slice(0,10), domainsSeen: domains.length } }).eq("id", integration.id).eq("user_id", user.id);
    return NextResponse.json({ ok: true, synced, domains: domains.length, errors });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Postmaster sync failed" }, { status: 400 }); }
}
