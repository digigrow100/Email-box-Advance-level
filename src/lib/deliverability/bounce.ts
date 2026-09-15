import "server-only";

export type SystemMailClassification = {
  type: "bounce" | "complaint" | null;
  failedRecipient?: string;
  statusCode?: string;
  diagnostic?: string;
};

const emailPattern = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;

export function classifySystemMail(input: { sender: string; subject: string; body: string; raw?: string }): SystemMailClassification {
  const sender = input.sender.toLowerCase();
  const subject = input.subject.toLowerCase();
  const raw = `${input.raw ?? ""}\n${input.body}`;
  const lower = raw.toLowerCase();

  const complaint = /feedback-type\s*:\s*abuse/i.test(raw)
    || /content-type\s*:\s*message\/feedback-report/i.test(raw)
    || (/abuse report|spam complaint/i.test(subject) && /original-(mail-from|rcpt-to)|feedback-type/i.test(lower));
  if (complaint) {
    const recipientMatch = raw.match(/(?:Original-Rcpt-To|Original-Recipient|Final-Recipient)\s*:\s*(?:rfc822;)?\s*([^\s;<>]+@[^\s;<>]+)/i);
    return { type: "complaint", failedRecipient: recipientMatch?.[1]?.toLowerCase() };
  }

  const bounceSender = /mailer-daemon|postmaster/.test(sender);
  const bounceSubject = /undeliver|delivery (?:status|failure|failed)|mail delivery failed|failure notice|returned mail|message not delivered|delivery has failed/.test(subject);
  const dsnBody = /content-type\s*:\s*message\/delivery-status/i.test(raw) || /final-recipient\s*:|diagnostic-code\s*:|status\s*:\s*[245]\.\d+\.\d+/i.test(raw);
  if (bounceSender || bounceSubject || dsnBody) {
    const recipientMatch = raw.match(/(?:Final-Recipient|Original-Recipient|X-Failed-Recipients)\s*:\s*(?:rfc822;)?\s*([^\s;<>]+@[^\s;<>]+)/i)
      || raw.match(/(?:delivery to|recipient|address)\s*[<:\s]+([^\s<>]+@[^\s<>]+)/i)
      || raw.match(emailPattern);
    const status = raw.match(/(?:^|\n)Status\s*:\s*([245]\.\d{1,3}\.\d{1,3})/im)?.[1];
    const diagnostic = raw.match(/(?:^|\n)Diagnostic-Code\s*:\s*([^\r\n]+)/im)?.[1]?.trim();
    return { type: "bounce", failedRecipient: recipientMatch?.[1]?.toLowerCase(), statusCode: status, diagnostic: diagnostic?.slice(0, 500) };
  }
  return { type: null };
}
