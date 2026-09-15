import "server-only";
import { decryptJson } from "@/lib/crypto";
import { refreshGmailAccessToken } from "@/lib/mail/gmail";

export type StoredMailbox = {
  id: string;
  user_id: string;
  provider: "gmail" | "custom";
  email: string;
  display_name?: string | null;
  credential_blob: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  signature?: string | null;
  timezone?: string | null;
  consecutive_failures?: number;
};

type Secret = { password?: string; refreshToken?: string };

export async function runtimeCredentials(mailbox: StoredMailbox) {
  const secret = decryptJson<Secret>(mailbox.credential_blob);
  let accessToken: string | undefined;
  if (mailbox.provider === "gmail") {
    if (!secret.refreshToken) throw new Error("Missing Gmail refresh token");
    accessToken = (await refreshGmailAccessToken(secret.refreshToken)).access_token;
  }
  return {
    imap: { host: mailbox.imap_host, port: mailbox.imap_port, secure: mailbox.imap_secure, user: mailbox.email, pass: secret.password, accessToken },
    smtp: { host: mailbox.smtp_host, port: mailbox.smtp_port, secure: mailbox.smtp_secure, user: mailbox.email, pass: secret.password, accessToken },
  };
}
