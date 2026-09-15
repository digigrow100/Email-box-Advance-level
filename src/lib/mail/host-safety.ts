import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import { env } from "@/lib/env";

const IMAP_PORTS = new Set([143, 993]);
const SMTP_PORTS = new Set([25, 465, 587, 2525]);

function privateIpv4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function privateIpv6(ip: string) {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? privateIpv4(mapped) : false;
}

function privateAddress(address: string) {
  const family = net.isIP(address);
  if (family === 4) return privateIpv4(address);
  if (family === 6) return privateIpv6(address);
  return true;
}

export async function assertSafeMailHost(hostValue: unknown, kind: "imap" | "smtp", portValue: unknown) {
  const host = String(hostValue ?? "").trim().toLowerCase().replace(/\.$/, "");
  const port = Number(portValue);
  if (!host || host.length > 253 || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid ${kind.toUpperCase()} host or port`);
  if (kind === "imap" && !IMAP_PORTS.has(port)) throw new Error("IMAP port must be 143 or 993");
  if (kind === "smtp" && !SMTP_PORTS.has(port)) throw new Error("SMTP port must be 25, 465, 587, or 2525");
  if (env.allowPrivateMailHosts) return { host, port };
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "metadata.google.internal") throw new Error("Private/local mail hosts are blocked");

  if (net.isIP(host)) {
    if (privateAddress(host)) throw new Error("Private/reserved mail host addresses are blocked");
    return { host, port };
  }

  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length) throw new Error(`Could not resolve ${kind.toUpperCase()} host`);
  if (records.some((record: { address: string }) => privateAddress(record.address))) throw new Error("Mail host resolves to a private/reserved address");
  return { host, port };
}
