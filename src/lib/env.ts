const isProduction = process.env.NODE_ENV === "production";

function envFlag(name: string, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  // Demo mode is convenient locally, but production must opt in explicitly.
  demoMode: envFlag("DEMO_MODE", !isProduction),
  publicDemoMode: envFlag("NEXT_PUBLIC_DEMO_MODE", !isProduction),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  encryptionKey: process.env.EMAIL_ENCRYPTION_KEY ?? "",
  trackingSecret: process.env.TRACKING_SECRET ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/gmail/callback`,
  googlePostmasterRedirectUri: process.env.GOOGLE_POSTMASTER_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/deliverability/google/callback`,
  cronSecret: process.env.CRON_SECRET ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
  openAiTimeoutMs: Math.max(5_000, Math.min(120_000, Number(process.env.OPENAI_TIMEOUT_MS ?? 30_000))),
  allowInsecureMailTls: envFlag("ALLOW_INSECURE_MAIL_TLS", false),
  allowPrivateMailHosts: envFlag("ALLOW_PRIVATE_MAIL_HOSTS", false),
};

export function requireEnv(value: string, name: string) {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function productionEnvProblems() {
  if (!isProduction) return [] as string[];
  const problems: string[] = [];
  if (env.demoMode || env.publicDemoMode) problems.push("Demo mode must be disabled in production");
  if (!env.appUrl.startsWith("https://")) problems.push("NEXT_PUBLIC_APP_URL must use HTTPS in production");
  for (const [name, value] of [
    ["NEXT_PUBLIC_SUPABASE_URL", env.supabaseUrl],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", env.supabaseAnonKey],
    ["SUPABASE_SERVICE_ROLE_KEY", env.supabaseServiceRoleKey],
    ["EMAIL_ENCRYPTION_KEY", env.encryptionKey],
    ["CRON_SECRET", env.cronSecret],
  ] as const) {
    if (!value) problems.push(`${name} is missing`);
  }
  if (!env.trackingSecret) problems.push("TRACKING_SECRET is missing (required when open/click tracking is enabled)");
  if (env.allowInsecureMailTls) problems.push("ALLOW_INSECURE_MAIL_TLS must be false in production");
  if (env.allowPrivateMailHosts) problems.push("ALLOW_PRIVATE_MAIL_HOSTS should normally be false in production");
  return problems;
}
