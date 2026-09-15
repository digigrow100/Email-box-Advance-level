import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { boundedText, jsonBody } from "@/lib/validation";
import { inspectSeedPlacement, placementMarker, sendPlacementProbe } from "@/lib/deliverability/placement";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await jsonBody<any>(request, 20_000);
    const action = body.action === "check" ? "check" : "start";

    if (action === "start") {
      const sourceMailboxId = boundedText(body.sourceMailboxId, "Source mailbox", 100);
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const [{ data: source, error: sourceError }, { data: seeds, error: seedsError }, { count: testsToday, error: countError }] = await Promise.all([
        supabase.from("mailboxes").select("*").eq("id", sourceMailboxId).eq("user_id", user.id).single(),
        supabase.from("seed_inboxes").select("id,mailbox_id,label,provider_hint,mailboxes(email)").eq("user_id", user.id).eq("active", true),
        supabase.from("placement_tests").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", dayStart.toISOString()),
      ]);
      if (sourceError || !source) throw new Error("Source mailbox not found");
      if (seedsError) throw seedsError;
      if (countError) throw countError;
      if ((testsToday ?? 0) >= 10) throw new Error("Daily placement-test limit reached (10 per workspace)");
      const usable = (seeds ?? []).filter((s: any) => s.mailbox_id !== source.id && s.mailboxes?.email).slice(0, 20);
      if (!usable.length) throw new Error("Add at least one different connected mailbox as a seed inbox first");
      const marker = placementMarker();
      const subject = `[${marker}] MailPilot inbox placement test`;
      const { data: test, error: testError } = await supabase.from("placement_tests").insert({ user_id: user.id, source_mailbox_id: source.id, marker, subject, status: "sent" }).select("id,created_at").single();
      if (testError) throw testError;
      for (const seed of usable) {
        const mailboxJoin = seed.mailboxes as unknown as { email: string } | { email: string }[] | null;
        const recipient = (Array.isArray(mailboxJoin) ? mailboxJoin[0]?.email : mailboxJoin?.email) as string;
        try {
          await sendPlacementProbe(source, [recipient], marker);
          await supabase.from("placement_results").insert({ user_id: user.id, test_id: test.id, seed_inbox_id: seed.id, recipient_email: recipient, placement: "unknown", details: { providerHint: seed.provider_hint } });
        } catch (error) {
          await supabase.from("placement_results").insert({ user_id: user.id, test_id: test.id, seed_inbox_id: seed.id, recipient_email: recipient, placement: "unknown", details: { sendError: error instanceof Error ? error.message : "Send failed" } });
        }
      }
      await supabase.from("message_events").insert({ user_id: user.id, mailbox_id: source.id, type: "placement", metadata: { testId: test.id, marker, seeds: usable.length } });
      return NextResponse.json({ ok: true, testId: test.id, marker });
    }

    const testId = boundedText(body.testId, "Placement test", 100);
    const { data: test, error: testError } = await supabase.from("placement_tests").select("id,marker,created_at,source_mailbox_id").eq("id", testId).eq("user_id", user.id).single();
    if (testError || !test) throw new Error("Placement test not found");
    const { data: results, error: resultsError } = await supabase.from("placement_results").select("id,seed_inbox_id,recipient_email,seed_inboxes(mailbox_id)").eq("test_id", test.id).eq("user_id", user.id);
    if (resultsError) throw resultsError;
    let found = 0;
    for (const row of results ?? []) {
      const mailboxId = (row as any).seed_inboxes?.mailbox_id;
      if (!mailboxId) continue;
      const { data: seedMailbox } = await supabase.from("mailboxes").select("*").eq("id", mailboxId).eq("user_id", user.id).single();
      if (!seedMailbox) continue;
      try {
        const placement = await inspectSeedPlacement(seedMailbox, test.marker, test.created_at);
        if (placement.placement !== "not_found" && placement.placement !== "unknown") found++;
        await supabase.from("placement_results").update({ placement: placement.placement, matched_folder: placement.folder ?? null, received_at: placement.date?.toISOString() ?? null, checked_at: new Date().toISOString(), details: { uid: placement.uid ?? null, authentication: placement.authentication ?? null } }).eq("id", row.id).eq("user_id", user.id);
      } catch (error) {
        await supabase.from("placement_results").update({ checked_at: new Date().toISOString(), details: { checkError: error instanceof Error ? error.message : "Check failed" } }).eq("id", row.id).eq("user_id", user.id);
      }
    }
    const total = results?.length ?? 0;
    const status = found === total && total > 0 ? "completed" : found > 0 ? "partial" : "checking";
    await supabase.from("placement_tests").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", test.id).eq("user_id", user.id);
    return NextResponse.json({ ok: true, status, found, total });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Placement test failed" }, { status: 400 });
  }
}
