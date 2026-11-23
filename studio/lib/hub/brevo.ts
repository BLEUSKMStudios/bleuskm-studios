import "server-only";

import { emailHtml } from "./casting-core.ts";

/** Casting emails always come from the casting alias, and replies go back to it. */
export const CASTING_SENDER = { email: "casting@bleuskm.com", name: "BLEUSKM Studios Casting" };

export function brevoConfigured(): boolean {
  return !!(process.env.BREVO_KEY ?? "").trim();
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

/** Sends one transactional email through Brevo. Never logs the key or the message body. */
export async function sendCastingEmail(to: { email: string; name: string }, subject: string, body: string): Promise<SendResult> {
  const key = (process.env.BREVO_KEY ?? "").trim();
  if (!key) return { ok: false, error: "Email is not set up yet (BREVO_KEY missing in the hub's Vercel project)." };
  try {
    // Local end-to-end tests point this at a mock server; never set in Vercel.
    const base = (process.env.BREVO_API_URL_FOR_TESTS ?? "").trim() || "https://api.brevo.com/v3";
    const res = await fetch(`${base}/smtp/email`, {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: CASTING_SENDER,
        replyTo: CASTING_SENDER,
        to: [{ email: to.email, name: to.name || to.email }],
        subject,
        textContent: body,
        htmlContent: emailHtml(body),
        tags: ["studio-os-casting"],
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
