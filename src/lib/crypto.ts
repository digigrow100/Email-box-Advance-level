import "server-only";
import crypto from "node:crypto";
import { env, requireEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";

function keyBuffer() {
  const key = Buffer.from(requireEnv(env.encryptionKey, "EMAIL_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) throw new Error("EMAIL_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

export function encryptJson(value: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptJson<T>(payload: string): T {
  const [version, ivB64, tagB64, encryptedB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !encryptedB64) throw new Error("Invalid encrypted payload");
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedB64, "base64")), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}
