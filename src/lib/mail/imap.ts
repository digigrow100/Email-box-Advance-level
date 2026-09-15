import "server-only";
import { ImapFlow } from "imapflow";
import { env } from "@/lib/env";

export type ImapCredentials = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass?: string;
  accessToken?: string;
};

function client(credentials: ImapCredentials) {
  return new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    auth: credentials.accessToken
      ? { user: credentials.user, accessToken: credentials.accessToken }
      : { user: credentials.user, pass: credentials.pass ?? "" },
    logger: false,
    tls: { rejectUnauthorized: !env.allowInsecureMailTls },
    socketTimeout: 20_000,
  });
}

export async function testImapConnection(credentials: ImapCredentials) {
  const imap = client(credentials);
  try {
    await imap.connect();
    return true;
  } finally {
    if (imap.usable) await imap.logout().catch(() => undefined);
  }
}

export async function fetchInboxMessages(credentials: ImapCredentials, options: { since?: Date; minUid?: number; limit?: number } = {}) {
  const imap = client(credentials);
  await imap.connect();
  const lock = await imap.getMailboxLock("INBOX");
  const items: Array<{ uid: number; from: string; to: string[]; cc: string[]; subject: string; messageId?: string; inReplyTo?: string; references?: string; date?: Date; source: Buffer }> = [];
  try {
    const search: any = options.minUid ? { uid: `${options.minUid}:*` } : options.since ? { since: options.since } : { all: true };
    for await (const message of imap.fetch(search, { uid: true, envelope: true, source: true })) {
      const from = message.envelope?.from?.[0];
      const refs = Array.isArray((message.envelope as any)?.references) ? (message.envelope as any).references.join(" ") : "";
      items.push({
        uid: message.uid,
        from: from?.address ?? "",
        to: (message.envelope?.to ?? []).map((a: any) => a.address ?? "").filter(Boolean),
        cc: (message.envelope?.cc ?? []).map((a: any) => a.address ?? "").filter(Boolean),
        subject: message.envelope?.subject ?? "",
        messageId: message.envelope?.messageId,
        inReplyTo: message.envelope?.inReplyTo,
        references: refs,
        date: message.envelope?.date ? new Date(message.envelope.date) : undefined,
        source: Buffer.isBuffer(message.source) ? message.source : Buffer.from(message.source ?? ""),
      });
      if (items.length >= Math.max(1, Math.min(options.limit ?? 100, 500))) break;
    }
  } finally {
    lock.release();
    await imap.logout().catch(() => undefined);
  }
  return items;
}

export async function listRecentInboxMessages(credentials: ImapCredentials, since: Date, limit = 50) {
  return fetchInboxMessages(credentials, { since, limit });
}

export async function markImapMessageSeen(credentials: ImapCredentials, uid: number) {
  if (!Number.isInteger(uid) || uid <= 0) return false;
  const imap = client(credentials);
  await imap.connect();
  const lock = await imap.getMailboxLock("INBOX");
  try {
    return await imap.messageFlagsAdd(uid, ["\\Seen"], { uid: true, silent: true });
  } finally {
    lock.release();
    await imap.logout().catch(() => undefined);
  }
}

export async function archiveImapMessage(credentials: ImapCredentials, uid: number) {
  if (!Number.isInteger(uid) || uid <= 0) return false;
  const imap = client(credentials);
  await imap.connect();
  try {
    const mailboxes = await imap.list();
    const archive = mailboxes.find((box: any) => box.specialUse === "\\Archive")
      ?? mailboxes.find((box: any) => box.specialUse === "\\All")
      ?? mailboxes.find((box: any) => /(^|[\\/])archives?$/i.test(String(box.path)) || /all mail/i.test(String(box.path)));
    if (!archive?.path) return false;
    const lock = await imap.getMailboxLock("INBOX");
    try {
      const moved = await imap.messageMove(uid, archive.path, { uid: true });
      return Boolean(moved);
    } finally {
      lock.release();
    }
  } finally {
    await imap.logout().catch(() => undefined);
  }
}

export type PlacementMatch = {
  placement: "inbox" | "spam" | "other" | "not_found" | "unknown";
  folder?: string;
  uid?: number;
  date?: Date;
  authentication?: { spf?: string; dkim?: string; dmarc?: string };
};

function authenticationFromHeaders(headers?: Buffer) {
  if (!headers?.length) return undefined;
  const text = headers.toString("utf8").replace(/\r?\n[ \t]+/g, " ");
  const authLines = text.split(/\r?\n/).filter((line) => /^(authentication-results|arc-authentication-results|received-spf):/i.test(line));
  if (!authLines.length) return undefined;
  const joined = authLines.join(" ");
  const status = (name: string) => joined.match(new RegExp(`\\b${name}=([a-z0-9_-]+)`, "i"))?.[1]?.toLowerCase();
  const spfHeader = authLines.find((line) => /^received-spf:/i.test(line));
  const spf = status("spf") || spfHeader?.match(/^received-spf:\s*([a-z0-9_-]+)/i)?.[1]?.toLowerCase();
  const result = { spf, dkim: status("dkim"), dmarc: status("dmarc") };
  return result.spf || result.dkim || result.dmarc ? result : undefined;
}

export async function findMessagePlacement(credentials: ImapCredentials, marker: string, since = new Date(Date.now() - 24 * 60 * 60 * 1000)): Promise<PlacementMatch> {
  const imap = client(credentials);
  await imap.connect();
  try {
    const boxes = await imap.list();
    const prioritized = [...boxes].sort((a: any, b: any) => {
      const rank = (box: any) => {
        if (String(box.path).toUpperCase() === "INBOX") return 0;
        if (box.specialUse === "\\Junk" || /(^|[\\/])(spam|junk)( mail)?$/i.test(String(box.path))) return 1;
        return 2;
      };
      return rank(a) - rank(b);
    }).slice(0, 40);

    for (const box of prioritized) {
      const path = String((box as any).path || "");
      if (!path || (box as any).specialUse === "\\Trash" || (box as any).specialUse === "\\Drafts" || (box as any).specialUse === "\\Sent") continue;
      let lock: { release(): void } | null = null;
      try {
        lock = await imap.getMailboxLock(path);
        const uids = await imap.search({ since, subject: marker }, { uid: true }) as number[];
        if (!uids?.length) continue;
        const uid = uids[uids.length - 1];
        const message = await imap.fetchOne(uid, { envelope: true, headers: ["authentication-results", "arc-authentication-results", "received-spf"] }, { uid: true });
        if (!message) continue;
        const spam = (box as any).specialUse === "\\Junk" || /(^|[\\/])(spam|junk)( mail)?$/i.test(path);
        const inbox = path.toUpperCase() === "INBOX";
        const envelopeDate = message.envelope?.date ? new Date(message.envelope.date) : undefined;
        return { placement: inbox ? "inbox" : spam ? "spam" : "other", folder: path, uid, date: envelopeDate, authentication: authenticationFromHeaders(message.headers) };
      } catch {
        // Some providers expose virtual/special folders that cannot be selected.
      } finally {
        lock?.release();
      }
    }
    return { placement: "not_found" };
  } finally {
    await imap.logout().catch(() => undefined);
  }
}
