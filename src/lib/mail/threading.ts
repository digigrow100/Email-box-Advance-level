import "server-only";

export function normalizeSubject(subject: string) {
  return (subject || "(no subject)")
    .replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

export function externalThreadKey(input: { subject: string; from: string; mailbox: string; inReplyTo?: string | null; references?: string | null }) {
  if (input.inReplyTo) return `reply:${input.inReplyTo.trim()}`;
  if (input.references) {
    const ids = input.references.match(/<[^>]+>/g);
    if (ids?.length) return `reply:${ids[ids.length - 1]}`;
  }
  const other = input.from.toLowerCase() === input.mailbox.toLowerCase() ? "self" : input.from.toLowerCase();
  return `subject:${normalizeSubject(input.subject)}:${other}`;
}
