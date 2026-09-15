import "server-only";
import crypto from "node:crypto";
import { runtimeCredentials, type StoredMailbox } from "@/lib/mail/account";
import { findMessagePlacement } from "@/lib/mail/imap";
import { sendSmtpMail } from "@/lib/mail/smtp";

export function placementMarker() {
  return `MP-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

export async function sendPlacementProbe(source: StoredMailbox, recipients: string[], marker: string, subjectBase = "MailPilot inbox placement test") {
  const credentials = await runtimeCredentials(source);
  const subject = `[${marker}] ${subjectBase}`;
  const text = `This is a MailPilot deliverability placement test.\n\nMarker: ${marker}\n\nNo reply is needed.`;
  const result = await sendSmtpMail(credentials.smtp, {
    fromName: source.display_name ?? "MailPilot Test",
    to: recipients,
    subject,
    text,
    headers: { "X-MailPilot-Placement-ID": marker },
  });
  return { subject, result };
}

export async function inspectSeedPlacement(seed: StoredMailbox, marker: string, createdAt: string | Date) {
  const credentials = await runtimeCredentials(seed);
  const since = new Date(new Date(createdAt).getTime() - 10 * 60 * 1000);
  return findMessagePlacement(credentials.imap, marker, since);
}
