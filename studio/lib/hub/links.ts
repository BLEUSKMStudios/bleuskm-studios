// Secure public links (self-tape uploads, signing, document views). Pure code.
import { createHash, randomBytes } from "node:crypto";

/** A new random link token (256 bits, URL-safe). Only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isToken(t: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(t);
}

/** The hub's public address for links in emails. */
export function publicBase(env: Record<string, string | undefined>, host?: string | null, proto?: string | null): string {
  const set = (env.STUDIO_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  if (/^https:\/\/[a-z0-9.-]+$/i.test(set)) return set;
  if (host && /^[a-z0-9.:-]+$/i.test(host)) return `${proto === "http" ? "http" : "https"}://${host}`;
  return "https://studio.bleuskm.com";
}
