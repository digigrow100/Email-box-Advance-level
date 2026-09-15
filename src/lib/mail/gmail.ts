import "server-only";
import { env, requireEnv } from "@/lib/env";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function gmailAuthorizationUrl(state: string, codeChallenge: string) {
  const query = new URLSearchParams({
    client_id: requireEnv(env.googleClientId, "GOOGLE_CLIENT_ID"),
    redirect_uri: requireEnv(env.googleRedirectUri, "GOOGLE_REDIRECT_URI"),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: "openid email https://mail.google.com/",
  });
  return `${AUTH_URL}?${query.toString()}`;
}

export async function exchangeGmailCode(code: string, codeVerifier: string) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      client_id: requireEnv(env.googleClientId, "GOOGLE_CLIENT_ID"),
      client_secret: requireEnv(env.googleClientSecret, "GOOGLE_CLIENT_SECRET"),
      redirect_uri: requireEnv(env.googleRedirectUri, "GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google token exchange failed: ${response.status}`);
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number; id_token?: string }>;
}

export async function refreshGmailAccessToken(refreshToken: string) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv(env.googleClientId, "GOOGLE_CLIENT_ID"),
      client_secret: requireEnv(env.googleClientSecret, "GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google token refresh failed: ${response.status}`);
  return response.json() as Promise<{ access_token: string; expires_in: number }>;
}

export async function getGoogleEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!response.ok) throw new Error("Could not read Google account email");
  const profile = await response.json() as { email?: string; name?: string };
  if (!profile.email) throw new Error("Google account did not return an email address");
  return profile;
}
