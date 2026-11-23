import "server-only";

import { CASTING_FROM, CREW_FROM, emailHtml } from "./casting-core.ts";

/**
 * Casting emails come from casting@ and crew-call emails from crew@ (both verified
 * Brevo senders). Replies go back to the same alias.
 */
export const CASTING_SENDER = { email: CASTING_FROM, name: "BLEUSKM Studios Casting" };
export const CREW_SENDER = { email: CREW_FROM, name: "BLEUSKM Studios Crew" };

export function brevoConfigured(): boolean {
  return !!(process.env.BREVO_KEY ?? "").trim();
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

/** Sends one transactional email through Brevo. Never logs the key or the message body. */
export async function sendCastingEmail(to: { email: string; name: string }, subject: string, body: string, crew = false): Promise<SendResult> {
  const sender = crew ? CREW_SENDER : CASTING_SENDER;
  const key = (process.env.BREVO_KEY ?? "").trim();
  if (!key) return { ok: false, error: "Email is not set up yet (BREVO_KEY missing in the hub's Vercel project)." };
  try {
    // Local end-to-end tests point this at a mock server; never set in Vercel.
    const base = (process.env.BREVO_API_URL_FOR_TESTS ?? "").trim() || "https://api.brevo.com/v3";
    const res = await fetch(`${base}/smtp/email`, {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender,
        replyTo: sender,
        to: [{ email: to.email, name: to.name || to.email }],
        subject,
        textContent: body,
        htmlContent: emailHtml(body, sender.email),
        tags: [crew ? "studio-os-crew" : "studio-os-casting"],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => ({}))) as { messageId?: string; code?: string; message?: string };
    if (!res.ok) {
      const code = String(data.code ?? res.status).replace(/[^\w.-]/g, "").slice(0, 60);
      console.error(`[casting-email] Brevo refused the email: ${res.status} ${code}`);
      return { ok: false, error: `Brevo refused the email (${code}).` };
    }
    return { ok: true, id: data.messageId ?? null };
  } catch {
    console.error("[casting-email] Brevo could not be reached");
    return { ok: false, error: "Brevo could not be reached. Try again." };
  }
}

// ---------------------------------------------------------------------------
// Read-only views for Communications. Nothing here creates contacts, lists,
// templates or campaigns, so nothing can be duplicated.
// ---------------------------------------------------------------------------
export type BrevoRead<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * What a refused Brevo read means, in words. Brevo's own code and message are
 * shown to the signed-in person (never logged: messages can include an IP).
 */
export function brevoReadError(status: number, body: { code?: unknown; message?: unknown }, what: string): string {
  const code = String(body.code ?? "").replace(/[^\w.-]/g, "").slice(0, 60);
  const msg = String(body.message ?? "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, 240);
  const said = code || msg ? ` Brevo said: ${[code, msg].filter(Boolean).join(" · ")}.` : "";
  if (status === 401) {
    return `Brevo refused the key (401) when reading ${what}. The key is wrong or revoked, or Brevo's "Authorized IPs" setting blocks Vercel's servers.${said}`;
  }
  if (status === 403) {
    return `Brevo refused access to ${what} (403). The key works for other reads, so this account or key is not allowed to read ${what}: usually the marketing campaigns feature is not activated or is under review on the account, or the key was created without that permission.${said}`;
  }
  if (status === 429) return `Brevo is rate-limiting requests (429). Try again in a minute.${said}`;
  return `Brevo answered ${status} when reading ${what}.${said}`;
}

async function brevoGet<T>(path: string, what: string): Promise<BrevoRead<T>> {
  const key = (process.env.BREVO_KEY ?? "").trim();
  if (!key) return { ok: false, error: "Brevo isn't connected (BREVO_KEY is missing in the hub's Vercel project)." };
  try {
    const base = (process.env.BREVO_API_URL_FOR_TESTS ?? "").trim() || "https://api.brevo.com/v3";
    const res = await fetch(`${base}${path}`, {
      headers: { "api-key": key, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { code?: unknown; message?: unknown };
      const code = String(body.code ?? "").replace(/[^\w.-]/g, "").slice(0, 60);
      console.error(`[brevo] read ${path.split("?")[0]} failed: ${res.status} ${code}`);
      return { ok: false, error: brevoReadError(res.status, body, what) };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, error: "Brevo could not be reached." };
  }
}

export type BrevoTemplate = { id: number; name: string; subject: string; isActive: boolean; modifiedAt?: string; sender?: { email?: string } };
export function brevoTemplates() {
  return brevoGet<{ templates?: BrevoTemplate[]; count?: number }>("/smtp/templates?limit=50&offset=0&sort=desc", "email templates");
}

export type BrevoCampaign = {
  id: number; name: string; subject?: string; status: string; sentDate?: string; scheduledAt?: string;
  sender?: { email?: string };
  statistics?: { globalStats?: { sent?: number; delivered?: number; uniqueViews?: number; uniqueClicks?: number; unsubscriptions?: number } };
};
export function brevoCampaigns() {
  return brevoGet<{ campaigns?: BrevoCampaign[]; count?: number }>("/emailCampaigns?limit=20&offset=0&sort=desc&statistics=globalStats", "email campaigns");
}

export type BrevoList = { id: number; name: string; uniqueSubscribers?: number; totalSubscribers?: number; totalBlacklisted?: number };
export function brevoLists() {
  return brevoGet<{ lists?: BrevoList[]; count?: number }>("/contacts/lists?limit=50&offset=0&sort=desc", "contact lists");
}

export type BrevoEvent = { email: string; date: string; subject?: string; event: string; templateId?: number; tag?: string };
/** Recent delivery events (sent, delivered, opened, bounced …) for transactional email. */
export function brevoEvents(days = 7) {
  return brevoGet<{ events?: BrevoEvent[] }>(`/smtp/statistics/events?limit=50&days=${days}&sort=desc`, "email events");
}
