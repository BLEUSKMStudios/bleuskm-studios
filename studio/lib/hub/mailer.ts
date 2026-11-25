import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { writeBlockReason } from "./env.ts";
import { sendGate, type IdentityRow } from "./mail-rules.ts";
import { toHtml } from "./templates.ts";

/**
 * The one way Studio OS sends transactional email (Brevo). Every send:
 *  - is written to comm_messages first, under an idempotency key, so the
 *    same message can never go out twice (double clicks, retries, re-runs);
 *  - goes out only from a sender identity the owner has verified;
 *  - never goes to an address that bounced or complained;
 *  - is recorded on the contact's and production's timeline.
 *
 * Uses the server (admin) client: callers check the person's access first.
 */
export type SendInput = {
  identityKey: string;
  to: { email: string; name?: string | null };
  subject: string;
  body: string;
  previewText?: string | null;
  idempotencyKey: string;
  contactId?: string | null;
  productionId?: string | null;
  section?: string;              // the section the email belongs to (timeline visibility)
  templateKey?: string | null;
  related?: { table: string; id: string } | null;
  sentByName?: string | null;
  activityKind?: string;
  /** Secrets (one-time codes) sent to the person but never kept in the log staff can read. */
  redact?: string[];
  activitySummary?: string;
  unsubscribeUrl?: string | null;
  tags?: string[];
  /** Files sent with the email (base64 content), e.g. a signed agreement. */
  attachments?: { name: string; content: string }[];
};

export type SendOutcome =
  | { status: "sent"; messageId: string; providerId: string | null }
  | { status: "skipped"; messageId: string; reason: string }
  | { status: "blocked"; messageId: string | null; reason: string }
  | { status: "failed"; messageId: string | null; reason: string };

function brevoBase(): string {
  return (process.env.BREVO_API_URL_FOR_TESTS ?? "").trim() || "https://api.brevo.com/v3";
}

export async function sendTransactional(admin: SupabaseClient, input: SendInput): Promise<SendOutcome> {
  const email = input.to.email.trim().toLowerCase();
  const { data: identity } = await admin.from("email_identities").select("*").eq("key", input.identityKey).maybeSingle<IdentityRow>();
  let emailStatus: string | null = null;
  if (input.contactId) {
    const { data } = await admin.from("contacts").select("email_status").eq("id", input.contactId).maybeSingle();
    emailStatus = (data?.email_status as string | undefined) ?? null;
  }
  const html = toHtml(input.body, { from: identity?.address ?? "", preview: input.previewText, unsubscribeUrl: input.unsubscribeUrl });

  const scrub = (v: string) => (input.redact ?? []).filter((x) => x.length >= 4).reduce((a, x) => a.split(x).join("••••••"), v);
  // 1. Claim the idempotency key.
  const row = {
    production_id: input.productionId ?? null,
    direction: "outbound",
    channel: "brevo",
    from_address: identity?.address ?? null,
    to_addresses: email,
    subject: scrub(input.subject).slice(0, 500),
    body: scrub(input.body).slice(0, 100000),
    html: scrub(html).slice(0, 200000),
    status: "queued",
    sent_by_name: input.sentByName ?? null,
    contact_id: input.contactId ?? null,
    identity_key: identity ? input.identityKey : null,
    template_key: input.templateKey ?? null,
    idempotency_key: input.idempotencyKey,
    related_table: input.related?.table ?? null,
    related_id: input.related?.id ?? null,
    attempts: 1,
  };
  let messageId: string;
  const ins = await admin.from("comm_messages").insert(row).select("id").single();
  if (ins.error) {
    if (ins.error.code !== "23505") return { status: "failed", messageId: null, reason: "The email could not be recorded, so it was not sent." };
    const { data: prev } = await admin.from("comm_messages").select("id, status, attempts").eq("idempotency_key", input.idempotencyKey).single();
    if (!prev) return { status: "failed", messageId: null, reason: "The email could not be recorded, so it was not sent." };
    if (prev.status !== "failed") return { status: "skipped", messageId: prev.id, reason: "This email was already sent (or is being sent)." };
    // A failed attempt may be retried, once claimed again.
    const retry = await admin.from("comm_messages")
      .update({ status: "queued", attempts: (prev.attempts ?? 1) + 1, error: null, subject: row.subject, body: row.body, html: row.html })
      .eq("id", prev.id).eq("status", "failed").select("id").maybeSingle();
    if (!retry.data) return { status: "skipped", messageId: prev.id, reason: "This email is already being retried." };
    messageId = prev.id;
  } else {
    messageId = ins.data.id as string;
  }

  const finish = async (status: string, extra: Record<string, unknown>) => {
    await admin.from("comm_messages").update({ status, ...extra }).eq("id", messageId);
  };

  // 2. Gates: deployment, key, verified sender, deliverable address.
  const reason = sendGate({
    writeBlock: writeBlockReason(),
    brevoKey: !!(process.env.BREVO_KEY ?? "").trim(),
    identity: identity ?? null,
    emailStatus,
    to: email,
  });
  if (reason) {
    await finish("blocked", { error: reason.slice(0, 500) });
    return { status: "blocked", messageId, reason };
  }

  // 3. Send.
  const sender = { email: identity!.address, name: identity!.display_name };
  let providerId: string | null = null;
  try {
    const res = await fetch(`${brevoBase()}/smtp/email`, {
      method: "POST",
      headers: { "api-key": (process.env.BREVO_KEY ?? "").trim(), "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender,
        replyTo: { email: identity!.reply_to || identity!.address, name: identity!.display_name },
        to: [{ email, name: input.to.name || email }],
        subject: input.subject,
        textContent: input.body,
        htmlContent: html,
        tags: input.tags ?? [`studio-os-${input.identityKey}`],
        headers: { "X-Studio-Message": messageId },
        ...(input.attachments?.length ? { attachment: input.attachments } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => ({}))) as { messageId?: string; code?: string };
    if (!res.ok) {
      const code = String(data.code ?? res.status).replace(/[^\w.-]/g, "").slice(0, 60);
      console.error(`[mailer] Brevo refused a ${input.identityKey} email: ${res.status} ${code}`);
      const why = `Brevo refused the email (${code}).`;
      await finish("failed", { error: why });
      return { status: "failed", messageId, reason: why };
    }
    providerId = data.messageId ?? null;
  } catch {
    console.error("[mailer] Brevo could not be reached");
    await finish("failed", { error: "Brevo could not be reached." });
    return { status: "failed", messageId, reason: "Brevo could not be reached. Try again." };
  }
  await finish("sent", { provider_id: providerId, sent_at: new Date().toISOString() });

  // 4. Timeline.
  await admin.from("activity").insert({
    production_id: input.productionId ?? null,
    section: input.section ?? "communications",
    contact_id: input.contactId ?? null,
    kind: input.activityKind ?? "email.sent",
    summary: (input.activitySummary ?? `Email sent from ${sender.email}: ${input.subject}`).slice(0, 500),
    subject_table: "comm_messages",
    subject_id: messageId,
    actor_name: input.sentByName ?? null,
    details: { template: input.templateKey ?? null, identity: input.identityKey },
  });
  return { status: "sent", messageId, providerId };
}
