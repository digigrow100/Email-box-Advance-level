import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function writeAudit(_supabase: any, input: {
  userId: string;
  action: string;
  actorType?: "user" | "system" | "automation";
  entityType?: string;
  entityId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    // Audit writes use a narrow server-side service-role path so clients cannot forge audit history.
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      user_id: input.userId,
      actor_type: input.actorType ?? "system",
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      request_id: input.requestId ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) console.error("Audit log write failed", { action: input.action, code: error.code });
  } catch (error) {
    console.error("Audit log unavailable", { action: input.action, message: error instanceof Error ? error.message : "unknown" });
  }
}
