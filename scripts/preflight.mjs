const production = process.env.NODE_ENV === "production";
const failures = [];
const warnings = [];
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "EMAIL_ENCRYPTION_KEY",
  "CRON_SECRET",
];
for (const key of required) if (!process.env[key]) failures.push(`${key} is missing`);
if (production && !String(process.env.NEXT_PUBLIC_APP_URL || "").startsWith("https://")) failures.push("NEXT_PUBLIC_APP_URL must use HTTPS in production");
if (production && [process.env.DEMO_MODE, process.env.NEXT_PUBLIC_DEMO_MODE].some((v) => v === "true" || v === "1")) failures.push("Demo mode must be disabled in production");
if (process.env.ALLOW_INSECURE_MAIL_TLS === "true") warnings.push("ALLOW_INSECURE_MAIL_TLS is enabled");
if (process.env.ALLOW_PRIVATE_MAIL_HOSTS === "true") warnings.push("ALLOW_PRIVATE_MAIL_HOSTS is enabled");
if (process.env.EMAIL_ENCRYPTION_KEY) {
  try {
    const key = Buffer.from(process.env.EMAIL_ENCRYPTION_KEY, "base64");
    if (key.length !== 32) failures.push("EMAIL_ENCRYPTION_KEY must decode to exactly 32 bytes");
  } catch { failures.push("EMAIL_ENCRYPTION_KEY is not valid base64"); }
}
console.log(JSON.stringify({ ok: failures.length === 0, failures, warnings }, null, 2));
if (failures.length) process.exit(1);
