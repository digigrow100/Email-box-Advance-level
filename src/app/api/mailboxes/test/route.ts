import { NextResponse } from "next/server";
import { testImapConnection } from "@/lib/mail/imap";
import { testSmtpConnection } from "@/lib/mail/smtp";
import { assertSafeMailHost } from "@/lib/mail/host-safety";
import { requireUser } from "@/lib/supabase/server";
import { boundedText, jsonBody, requireEmail } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await jsonBody<any>(request, 64_000);
    const email = requireEmail(body.email);
    const password = boundedText(body.password, "Password", 512);
    const imapPort = Number(body.imapPort ?? 993);
    const smtpPort = Number(body.smtpPort ?? 465);
    const imap = await assertSafeMailHost(body.imapHost, "imap", imapPort);
    const smtp = await assertSafeMailHost(body.smtpHost, "smtp", smtpPort);

    const [imapResult, smtpResult] = await Promise.allSettled([
      testImapConnection({ host: imap.host, port: imap.port, secure: body.imapSecure !== false, user: email, pass: password }),
      testSmtpConnection({ host: smtp.host, port: smtp.port, secure: body.smtpSecure !== false, user: email, pass: password }),
    ]);

    const result = {
      imap: imapResult.status === "fulfilled",
      smtp: smtpResult.status === "fulfilled",
      imapError: imapResult.status === "rejected" ? String(imapResult.reason?.message ?? "IMAP connection failed").slice(0, 300) : null,
      smtpError: smtpResult.status === "rejected" ? String(smtpResult.reason?.message ?? "SMTP connection failed").slice(0, 300) : null,
    };
    return NextResponse.json({ ok: result.imap && result.smtp, ...result }, { status: result.imap && result.smtp ? 200 : 422 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Connection test failed" }, { status: 400 });
  }
}
