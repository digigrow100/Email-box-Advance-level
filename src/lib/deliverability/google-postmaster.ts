import "server-only";
import { env, requireEnv } from "@/lib/env";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmailpostmastertools.googleapis.com/v2";

export function postmasterAuthorizationUrl(state: string, codeChallenge: string) {
  const query = new URLSearchParams({
    client_id: requireEnv(env.googleClientId, "GOOGLE_CLIENT_ID"),
    redirect_uri: requireEnv(env.googlePostmasterRedirectUri, "GOOGLE_POSTMASTER_REDIRECT_URI"),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: "openid email https://www.googleapis.com/auth/postmaster.domain https://www.googleapis.com/auth/postmaster.traffic.readonly",
  });
  return `${AUTH_URL}?${query.toString()}`;
}

export async function exchangePostmasterCode(code: string, codeVerifier: string) {
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({
    code,
    code_verifier: codeVerifier,
    client_id: requireEnv(env.googleClientId, "GOOGLE_CLIENT_ID"),
    client_secret: requireEnv(env.googleClientSecret, "GOOGLE_CLIENT_SECRET"),
    redirect_uri: requireEnv(env.googlePostmasterRedirectUri, "GOOGLE_POSTMASTER_REDIRECT_URI"),
    grant_type: "authorization_code",
  }), cache: "no-store" });
  if (!response.ok) throw new Error(`Google Postmaster token exchange failed: ${response.status}`);
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

export async function refreshPostmasterToken(refreshToken: string) {
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({
    refresh_token: refreshToken,
    client_id: requireEnv(env.googleClientId, "GOOGLE_CLIENT_ID"),
    client_secret: requireEnv(env.googleClientSecret, "GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  }), cache: "no-store" });
  if (!response.ok) throw new Error(`Google Postmaster token refresh failed: ${response.status}`);
  return response.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function postmasterFetch(accessToken: string, path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...(init?.headers || {}) }, cache: "no-store" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Postmaster API ${response.status}: ${text.slice(0, 300)}`);
  }
  return response.json();
}

export async function listPostmasterDomains(accessToken: string) {
  const data = await postmasterFetch(accessToken, "/domains?pageSize=200");
  return (data.domains ?? []) as Array<{ name: string; createTime?: string; permission?: string }>;
}

export async function getPostmasterCompliance(accessToken: string, domain: string) {
  return postmasterFetch(accessToken, `/domains/${encodeURIComponent(domain)}/complianceStatus`);
}

function dateParts(date: Date) { return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }; }

export async function queryPostmasterMetrics(accessToken: string, domain: string, days = 7) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days - 1));
  const body = {
    metricDefinitions: [
      { name: "spam_rate", baseMetric: { standardMetric: "SPAM_RATE" } },
      { name: "spf_success", baseMetric: { standardMetric: "AUTH_SUCCESS_RATE" }, filter: 'auth_type = "spf"' },
      { name: "dkim_success", baseMetric: { standardMetric: "AUTH_SUCCESS_RATE" }, filter: 'auth_type = "dkim"' },
      { name: "dmarc_success", baseMetric: { standardMetric: "AUTH_SUCCESS_RATE" }, filter: 'auth_type = "dmarc"' },
      { name: "delivery_error_rate", baseMetric: { standardMetric: "DELIVERY_ERROR_RATE" } },
      { name: "tls_rate", baseMetric: { standardMetric: "TLS_ENCRYPTION_RATE" }, filter: 'traffic_direction = "outbound"' },
    ],
    timeQuery: { dateRanges: { dateRanges: [{ start: dateParts(start), end: dateParts(end) }] } },
    aggregationGranularity: "OVERALL",
    pageSize: 100,
  };
  const data = await postmasterFetch(accessToken, `/domains/${encodeURIComponent(domain)}/domainStats:query`, { method: "POST", body: JSON.stringify(body) });
  const metrics: Record<string, number | string | null> = {};
  for (const stat of data.domainStats ?? []) {
    const value = stat.value ?? {};
    const raw = value.doubleValue ?? value.floatValue ?? value.intValue ?? value.stringValue ?? null;
    metrics[String(stat.metric)] = typeof raw === "string" && /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
  }
  return { start, end, metrics, raw: data };
}
