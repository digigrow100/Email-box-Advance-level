import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";

function secret() {
  const value = env.trackingSecret || env.encryptionKey;
  if (!value) throw new Error("TRACKING_SECRET or EMAIL_ENCRYPTION_KEY is required for tracking");
  return value;
}

export function newTrackingToken() { return crypto.randomBytes(24).toString("base64url"); }

function sign(token: string, target: string) {
  return crypto.createHmac("sha256", secret()).update(`${token}\n${target}`).digest("base64url");
}

export function verifyClickSignature(token: string, target: string, signature: string) {
  const expected = sign(token, target);
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function trackingHtml(text: string, token: string, options: { open: boolean; click: boolean }) {
  const escaped = escapeHtml(text).replace(/\r?\n/g, "<br>");
  const linked = options.click
    ? escaped.replace(/https?:\/\/[^\s<]+/gi, (raw) => {
        const url = raw.replace(/&amp;/g, "&");
        const signature = sign(token, url);
        const href = `${env.appUrl}/api/t/${encodeURIComponent(token)}/click?u=${encodeURIComponent(url)}&s=${encodeURIComponent(signature)}`;
        return `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${raw}</a>`;
      })
    : escaped;
  const pixel = options.open ? `<img src="${env.appUrl}/api/t/${encodeURIComponent(token)}/open.gif" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;opacity:0" />` : "";
  return `<div>${linked}</div>${pixel}`;
}

export function anonymizedIpHash(ip: string) {
  return crypto.createHmac("sha256", secret()).update(ip || "unknown").digest("hex").slice(0, 32);
}
