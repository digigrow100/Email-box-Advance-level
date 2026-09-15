import "server-only";
import dns from "node:dns/promises";

export type DnsAuthResult = {
  domain: string;
  score: number;
  statuses: { spf: "pass"|"warning"|"fail"|"unknown"; dkim: "pass"|"warning"|"fail"|"unknown"; dmarc: "pass"|"warning"|"fail"|"unknown"; mx: "pass"|"warning"|"fail"|"unknown" };
  details: Record<string, unknown>;
  summary: string[];
};

async function txt(name: string) {
  try { return (await dns.resolveTxt(name)).map((parts: string[]) => parts.join("")); }
  catch { return [] as string[]; }
}

export async function checkDomainAuthentication(domainInput: string, selectors: string[] = []): Promise<DnsAuthResult> {
  const domain = domainInput.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new Error("Enter a valid domain");
  const [rootTxt, dmarcTxt, mx] = await Promise.all([
    txt(domain), txt(`_dmarc.${domain}`), dns.resolveMx(domain).catch(() => []),
  ]);
  const spfRecords = rootTxt.filter((r: string) => /^v=spf1\b/i.test(r));
  const dmarcRecords = dmarcTxt.filter((r: string) => /^v=dmarc1\b/i.test(r));
  const uniqueSelectors = [...new Set(selectors.map((s) => s.trim()).filter(Boolean).slice(0, 12))];
  const dkimRecords: Array<{ selector: string; record: string }> = [];
  for (const selector of uniqueSelectors) {
    const records = await txt(`${selector}._domainkey.${domain}`);
    const record = records.find((r: string) => /\bv=DKIM1\b/i.test(r) || /\bp=/i.test(r));
    if (record) dkimRecords.push({ selector, record });
  }

  const spf = spfRecords.length === 1 ? "pass" : spfRecords.length > 1 ? "fail" : "fail";
  const mxStatus = mx.length ? "pass" : "fail";
  let dmarc: DnsAuthResult["statuses"]["dmarc"] = "fail";
  if (dmarcRecords.length) {
    const record = dmarcRecords[0];
    dmarc = /\bp=(quarantine|reject)\b/i.test(record) ? "pass" : /\bp=none\b/i.test(record) ? "warning" : "warning";
  }
  const dkim: DnsAuthResult["statuses"]["dkim"] = uniqueSelectors.length ? (dkimRecords.length ? "pass" : "unknown") : "unknown";

  let score = 0;
  score += mxStatus === "pass" ? 20 : 0;
  score += spf === "pass" ? 30 : 0;
  score += dmarc === "pass" ? 30 : dmarc === "warning" ? 15 : 0;
  score += dkim === "pass" ? 20 : dkim === "unknown" ? 5 : 0;

  const summary: string[] = [];
  summary.push(spf === "pass" ? "SPF record found." : spfRecords.length > 1 ? "Multiple SPF records found; merge them into one." : "No SPF record found.");
  summary.push(dmarc === "pass" ? "DMARC enforcement is enabled." : dmarc === "warning" ? "DMARC exists but is not enforcing quarantine/reject." : "No DMARC record found.");
  summary.push(dkim === "pass" ? `DKIM found for ${dkimRecords.map((r) => r.selector).join(", ")}.` : "DKIM could not be confirmed with the configured selectors.");
  summary.push(mxStatus === "pass" ? `${mx.length} MX record(s) found.` : "No MX record found.");

  return {
    domain, score, statuses: { spf, dkim, dmarc, mx: mxStatus }, summary,
    details: { spfRecords, dmarcRecords, dkimRecords, mx: mx.map((r: { exchange: string; priority: number }) => ({ exchange: r.exchange, priority: r.priority })), selectorsChecked: uniqueSelectors },
  };
}
