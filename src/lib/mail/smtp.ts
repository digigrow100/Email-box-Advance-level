import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

export type SmtpCredentials = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass?: string;
  accessToken?: string;
};

function transporter(credentials: SmtpCredentials) {
  return nodemailer.createTransport({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    auth: credentials.accessToken
      ? { type: "OAuth2", user: credentials.user, accessToken: credentials.accessToken }
      : { user: credentials.user, pass: credentials.pass },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
    tls: { rejectUnauthorized: !env.allowInsecureMailTls },
  });
}

export async function testSmtpConnection(credentials: SmtpCredentials) {
  const smtp = transporter(credentials);
  try {
    await smtp.verify();
    return true;
  } finally {
    smtp.close();
  }
}

export async function sendSmtpMail(credentials: SmtpCredentials, message: { fromName?: string; to: string | string[]; cc?: string | string[]; subject: string; text: string; html?: string; replyTo?: string; inReplyTo?: string; references?: string | string[]; messageId?: string; headers?: Record<string, string>; requestDsn?: boolean }) {
  const smtp = transporter(credentials);
  try {
    const info = await smtp.sendMail({
      from: message.fromName ? { name: message.fromName, address: credentials.user } : credentials.user,
      to: message.to,
      cc: message.cc,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
      inReplyTo: message.inReplyTo,
      references: message.references,
      messageId: message.messageId,
      headers: message.headers,
      dsn: message.requestDsn ? ({ notify: "FAILURE,DELAY", ret: "HDRS" } as any) : undefined,
    });
    return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response };
  } finally {
    smtp.close();
  }
}
