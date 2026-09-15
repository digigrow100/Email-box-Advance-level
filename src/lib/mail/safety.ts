import "server-only";

const unsafeLocalParts = [
  "mailer-daemon",
  "postmaster",
  "no-reply",
  "noreply",
  "do-not-reply",
  "donotreply",
  "bounce",
  "notifications",
];

const unsafeSubjectPatterns = [
  /automatic reply/i,
  /auto.?reply/i,
  /out of office/i,
  /delivery status notification/i,
  /undeliver(?:ed|able)/i,
  /mail delivery (?:failed|subsystem)/i,
];

export function autoReplySafety(input: { from: string; subject?: string }) {
  const from = input.from.trim().toLowerCase();
  const local = from.split("@")[0] ?? from;
  if (!from.includes("@")) return { safe: false, reason: "Invalid sender address" };
  if (unsafeLocalParts.some((part) => local.includes(part))) return { safe: false, reason: "Automated/system sender" };
  if (unsafeSubjectPatterns.some((pattern) => pattern.test(input.subject ?? ""))) return { safe: false, reason: "Likely automated reply or delivery notice" };
  return { safe: true as const };
}
