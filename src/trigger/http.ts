export async function callInternalJob(path: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!appUrl || !secret) throw new Error("NEXT_PUBLIC_APP_URL and CRON_SECRET are required");
  const response = await fetch(`${appUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(90_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${text.slice(0, 1000)}`);
  try { return JSON.parse(text) as unknown; }
  catch { return { ok: true, raw: text }; }
}
