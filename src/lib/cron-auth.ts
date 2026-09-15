import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function isAuthorizedCronRequest(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    ?? request.headers.get("x-cron-secret")
    ?? "";
  return Boolean(env.cronSecret && safeEqual(supplied, env.cronSecret));
}
