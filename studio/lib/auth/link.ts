import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNextPath } from "./decide.ts";

/** Email link types the hub accepts. Sign-up is off, so "signup" is not one. */
export const LINK_TYPES = ["invite", "recovery", "email_change"] as const;

export type EmailLink =
  | { kind: "token"; tokenHash: string; type: EmailOtpType; next: string }
  | { kind: "code"; code: string; next: string }
  | { kind: "invalid" };

/**
 * Reads the parameters of an invitation or reset link. Some email services
 * rewrite "&" as "&amp;" when they wrap links for click tracking, which turns
 * "type" into "amp;type"; both spellings are accepted.
 */
export function readEmailLink(raw: Record<string, string | string[] | undefined>): EmailLink {
  const get = (key: string) => {
    const v = raw[key] ?? raw[`amp;${key}`];
    return (Array.isArray(v) ? v[0] : v)?.trim() || null;
  };
  const type = get("type");
  const tokenHash = get("token_hash");
  const code = get("code");
  const fallback = type === "invite" || type === "recovery" ? "/set-password" : "/";
  const next = safeNextPath(get("next"), fallback);
  if (tokenHash && type && (LINK_TYPES as readonly string[]).includes(type)) {
    return { kind: "token", tokenHash, type: type as EmailOtpType, next };
  }
  if (code) return { kind: "code", code, next };
  return { kind: "invalid" };
}
