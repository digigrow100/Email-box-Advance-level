const SIMPLE_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function validEmail(value: unknown) {
  const email = normalizeEmail(value);
  return email.length <= 320 && SIMPLE_EMAIL.test(email);
}

export function requireEmail(value: unknown, label = "email") {
  const email = normalizeEmail(value);
  if (!validEmail(email)) throw new Error(`Invalid ${label}`);
  return email;
}

export function requireEmailList(value: unknown, label = "recipients", max = 50) {
  const input = Array.isArray(value) ? value : [value];
  const emails = [...new Set(input.map(normalizeEmail).filter(Boolean))];
  if (!emails.length) throw new Error(`${label} are required`);
  if (emails.length > max) throw new Error(`Too many ${label}`);
  for (const email of emails) if (!validEmail(email)) throw new Error(`Invalid ${label} address`);
  return emails;
}

export function boundedText(value: unknown, label: string, max: number, options: { required?: boolean } = {}) {
  const text = String(value ?? "").trim();
  if (options.required !== false && !text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} is too long`);
  return text;
}

export function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function jsonBody<T = Record<string, unknown>>(request: Request, maxBytes = 256_000): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new Error("Request body is too large");
  return request.json() as Promise<T>;
}
