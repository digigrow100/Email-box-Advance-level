import { NextResponse } from "next/server";
import { analyzeContentSpamRisk } from "@/lib/deliverability/content";
import { requireUser } from "@/lib/supabase/server";
import { boundedText, jsonBody } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await jsonBody<any>(request, 280_000);
    const subject = String(body.subject ?? "").slice(0, 998);
    const text = boundedText(body.body ?? "", "Body", 250_000);
    return NextResponse.json({ ok: true, result: analyzeContentSpamRisk(subject, text) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Content analysis failed" }, { status: 400 });
  }
}
