import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { boundedText, jsonBody } from "@/lib/validation";

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.from("templates").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ templates: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load templates" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await jsonBody<any>(request, 300_000);
    const name = boundedText(body.name, "Name", 160);
    const subject = boundedText(body.subject, "Subject", 998);
    const messageBody = boundedText(body.body, "Body", 250_000);
    const { data, error } = await supabase.from("templates").insert({ user_id: user.id, name, subject, body: messageBody }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ template: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create template" }, { status: 400 });
  }
}
