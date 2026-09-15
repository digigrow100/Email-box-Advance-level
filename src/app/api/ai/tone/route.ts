import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { inferToneProfile } from "@/lib/ai";
import { boundedText, jsonBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await jsonBody(request, 150_000);
    const samples = Array.isArray(body.samples) ? body.samples.slice(0, 20).map((s: unknown) => String(s).slice(0, 5_000)).filter(Boolean) : [];

    if (body.action === "analyze") {
      if (!samples.length) throw new Error("Add writing samples");
      const instructions = await inferToneProfile(samples);
      return NextResponse.json({ instructions });
    }

    if (body.action === "save") {
      const name = boundedText(body.name, "Name", 120);
      const instructions = boundedText(body.instructions, "Instructions", 8_000);
      if (body.isDefault) await supabase.from("tone_profiles").update({ is_default: false }).eq("user_id", user.id);
      const { data, error } = await supabase.from("tone_profiles").insert({ user_id: user.id, name, instructions, example_snippets: samples, is_default: Boolean(body.isDefault) }).select("id").single();
      if (error) throw error;
      if (body.isDefault) {
        const { error: settingsError } = await supabase.from("ai_settings").upsert({ user_id: user.id, default_tone_profile_id: data.id }, { onConflict: "user_id" });
        if (settingsError) throw settingsError;
      }
      return NextResponse.json({ ok: true, id: data.id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tone action failed" }, { status: 400 });
  }
}
