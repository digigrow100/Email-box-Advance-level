import "server-only";

const spammyPhrases = [
  "act now", "buy now", "click here", "free money", "guaranteed", "limited time",
  "make money fast", "no obligation", "risk free", "urgent response", "winner",
  "100% free", "cash bonus", "double your", "earn extra cash", "lowest price",
];

export type ContentRisk = {
  score: number;
  risk: "low" | "medium" | "high";
  findings: Array<{ level: "info" | "warning" | "danger"; message: string }>;
  metrics: { links: number; words: number; uppercaseRatio: number; spamPhrases: number };
};

export function analyzeContentSpamRisk(subject: string, body: string): ContentRisk {
  const text = `${subject}\n${body}`.trim();
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const links = (text.match(/https?:\/\/[^\s<>()]+/gi) ?? []).length;
  const letters = text.match(/[A-Za-z]/g) ?? [];
  const uppers = text.match(/[A-Z]/g) ?? [];
  const uppercaseRatio = letters.length ? uppers.length / letters.length : 0;
  const matchedPhrases = spammyPhrases.filter((phrase) => lower.includes(phrase));
  const findings: ContentRisk["findings"] = [];
  let score = 0;

  if (!subject.trim()) { score += 12; findings.push({ level: "warning", message: "Missing subject line." }); }
  if (subject.length > 70) { score += 5; findings.push({ level: "warning", message: "Subject is long; shorter subjects are easier to scan." }); }
  if (links > 5) { score += 16; findings.push({ level: "danger", message: `High link count (${links}).` }); }
  else if (links > 2) { score += 7; findings.push({ level: "warning", message: `Several links (${links}) may increase filtering risk.` }); }
  if (uppercaseRatio > 0.45 && letters.length > 20) { score += 14; findings.push({ level: "danger", message: "A large share of the copy is uppercase." }); }
  else if (uppercaseRatio > 0.25 && letters.length > 20) { score += 6; findings.push({ level: "warning", message: "Uppercase usage is a little high." }); }
  if ((text.match(/!/g) ?? []).length > 5) { score += 7; findings.push({ level: "warning", message: "Heavy exclamation-mark usage." }); }
  if (matchedPhrases.length) { score += Math.min(25, matchedPhrases.length * 5); findings.push({ level: matchedPhrases.length > 2 ? "danger" : "warning", message: `Potentially spammy wording: ${matchedPhrases.slice(0, 5).join(", ")}.` }); }
  if (words.length < 15) { score += 4; findings.push({ level: "info", message: "Very short messages can be harder to evaluate reliably." }); }
  if (body.length > 12_000) { score += 5; findings.push({ level: "warning", message: "Message body is unusually long." }); }
  if (!/\b(unsubscribe|opt out|opt-out)\b/i.test(body)) findings.push({ level: "info", message: "No unsubscribe wording detected. Add it when required for your outreach type and jurisdiction." });
  if (!findings.length) findings.push({ level: "info", message: "No obvious content-level spam signals detected." });

  score = Math.max(0, Math.min(100, score));
  const risk = score >= 35 ? "high" : score >= 15 ? "medium" : "low";
  return { score, risk, findings, metrics: { links, words: words.length, uppercaseRatio: Number(uppercaseRatio.toFixed(2)), spamPhrases: matchedPhrases.length } };
}
