import { NextResponse } from "next/server";
import { parseCsv } from "@/lib/csv";
import { requireUser } from "@/lib/supabase/server";
import { jsonBody, normalizeEmail, validEmail } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await jsonBody(request, 5_000_000);
    if (!body.csv || typeof body.csv !== "string") throw new Error("CSV content is required");
    const rows = parseCsv(body.csv).slice(0, 5_000);
    const contacts = rows.map((row) => ({
      user_id: user.id,
      email: normalizeEmail(row.email),
      first_name: String(row.first_name ?? row.firstname ?? "").trim().slice(0, 120) || null,
      last_name: String(row.last_name ?? row.lastname ?? "").trim().slice(0, 120) || null,
      company: String(row.company ?? "").trim().slice(0, 200) || null,
      status: "active",
    })).filter((row) => validEmail(row.email));
    if (!contacts.length) throw new Error("No valid email rows found. Include an 'email' column.");
    const { data, error } = await supabase.from("contacts").upsert(contacts, { onConflict: "user_id,email", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    return NextResponse.json({ ok: true, imported: data?.length ?? contacts.length, ignored: rows.length - contacts.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 });
  }
}
