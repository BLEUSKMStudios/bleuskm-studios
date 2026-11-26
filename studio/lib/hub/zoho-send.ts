import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { commsSendBlockReason } from "./env.ts";
import { inboundKey, zohoSendGate, type IdentityRow } from "./mail-rules.ts";
import { smtpSend, zohoConfigured, type FullMessage } from "./zoho.ts";

// Every email sent through Zoho (replies and new emails) goes through here:
// the key is claimed first, so a double click or a retry never sends twice;
// then the gates (sending switched on, Zoho connected, the From address
// confirmed as "send as" in Zoho, a deliverable address); then one send,
// one log row and one timeline entry.

export type ZohoSendInput = {
  identityKey: string;
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
  threadKey?: string | null;
  idempotencyKey: string;
  contactId?: string | null;
  productionId?: string | null;
  sentByName?: string | null;
  related?: { table: string; id: string } | null;
};

export type ZohoSendResult =
  | { status: "sent"; messageId: string }
  | { status: "skipped" | "blocked" | "failed"; messageId: string | null; reason: string };

export async function loadIdentity(admin: SupabaseClient, key: string): Promise<IdentityRow | null> {
  const { data } = await admin.from("email_identities").select("key, address, display_name, reply_to, purpose, zoho_kind, brevo_verified, zoho_send_as, verified_at, notes").eq("key", key).maybeSingle();
  return (data as IdentityRow | null) ?? null;
}

/** The contact for an email address (active, not merged), if there is one. */
export async function contactForEmail(admin: SupabaseClient, email: string): Promise<{ id: string; full_name: string; email_status: string } | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const { data } = await admin.from("contacts").select("id, full_name, email_status").eq("email", e).is("merged_into", null).maybeSingle();
  return (data as { id: string; full_name: string; email_status: string } | null) ?? null;
}

export async function sendZoho(admin: SupabaseClient, input: ZohoSendInput): Promise<ZohoSendResult> {
  const to = input.to.trim().toLowerCase();
  const identity = await loadIdentity(admin, input.identityKey);
  const contact = input.contactId
    ? ((await admin.from("contacts").select("id, email_status").eq("id", input.contactId).maybeSingle()).data as { id: string; email_status: string } | null)
    : await contactForEmail(admin, to);

  // 1. Claim the key.
  const row = {
    production_id: input.productionId ?? null,
    direction: "outbound",
    channel: "zoho",
    from_address: identity?.address ?? null,
    to_addresses: to.slice(0, 5000),
    subject: input.subject.slice(0, 500),
    body: input.text.slice(0, 100000),
    status: "queued",
    sent_by_name: input.sentByName ?? null,
    contact_id: contact?.id ?? null,
    identity_key: identity ? input.identityKey : null,
    idempotency_key: input.idempotencyKey,
    thread_key: input.threadKey ?? input.inReplyTo ?? null,
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
    if (!["failed", "blocked"].includes(prev.status as string)) return { status: "skipped", messageId: prev.id as string, reason: "This email was already sent (or is being sent)." };
    const retry = await admin.from("comm_messages")
      .update({ ...row, status: "queued", attempts: ((prev.attempts as number) ?? 1) + 1, error: null })
      .eq("id", prev.id).in("status", ["failed", "blocked"]).select("id").maybeSingle();
    if (!retry.data) return { status: "skipped", messageId: prev.id as string, reason: "This email is already being retried." };
    messageId = prev.id as string;
  } else {
    messageId = ins.data.id as string;
  }
  const finish = async (status: string, extra: Record<string, unknown>) => {
    await admin.from("comm_messages").update({ status, ...extra }).eq("id", messageId);
  };

  // 2. Gates.
  const reason = zohoSendGate({ sendBlock: commsSendBlockReason(), configured: zohoConfigured(), identity, to, emailStatus: contact?.email_status ?? null });
  if (reason) {
    await finish("blocked", { error: reason.slice(0, 500) });
    return { status: "blocked", messageId, reason };
  }

  // 3. Send.
  const out = await smtpSend({
    from: { name: identity!.display_name, address: identity!.address },
    replyTo: identity!.reply_to,
    to,
    subject: input.subject,
    text: input.text,
    inReplyTo: input.inReplyTo ?? null,
    headers: { "X-Studio-Message": messageId },
  });
  if (!out.ok) {
    await finish("failed", { error: out.reason.slice(0, 500) });
    return { status: "failed", messageId, reason: out.reason };
  }
  await finish("sent", { provider_id: out.id?.slice(0, 300) ?? null, sent_at: new Date().toISOString() });

  // 4. Timeline.
  await admin.from("activity").insert({
    production_id: input.productionId ?? null,
    section: "communications",
    contact_id: contact?.id ?? null,
    kind: input.inReplyTo ? "email.replied" : "email.sent",
    summary: `${input.inReplyTo ? "Reply" : "Email"} sent from ${identity!.address}: ${input.subject}`.slice(0, 500),
    subject_table: "comm_messages",
    subject_id: messageId,
    actor_name: input.sentByName ?? null,
    details: { identity: input.identityKey, channel: "zoho" },
  });
  return { status: "sent", messageId };
}

/**
 * Files one inbox message in Studio OS (once, by its Message-ID), linked to
 * the sender's contact when there is one, and puts it on their timeline.
 * Returns the log row and the contact.
 */
export async function fileInbound(admin: SupabaseClient, m: FullMessage): Promise<{ id: string | null; contactId: string | null }> {
  const contact = m.fromEmail ? await contactForEmail(admin, m.fromEmail) : null;
  const key = inboundKey(m.messageId || `uid:${m.uid}:${m.date ?? ""}:${m.fromEmail}`);
  const { data: have } = await admin.from("comm_messages").select("id, contact_id").eq("idempotency_key", key).maybeSingle();
  if (have) {
    // Link it once the sender becomes a contact.
    if (!have.contact_id && contact) {
      await admin.from("comm_messages").update({ contact_id: contact.id }).eq("id", have.id).is("contact_id", null);
      await logInbound(admin, have.id as string, contact.id, m);
    }
    return { id: have.id as string, contactId: (have.contact_id as string | null) ?? contact?.id ?? null };
  }
  const ins = await admin.from("comm_messages").insert({
    production_id: null, direction: "inbound", channel: "zoho",
    from_address: m.fromEmail.slice(0, 254) || null, to_addresses: m.to.slice(0, 5000),
    subject: m.subject.slice(0, 500), body: m.text.slice(0, 100000), status: "received",
    sent_at: m.date, provider_id: m.messageId?.slice(0, 300) ?? null, contact_id: contact?.id ?? null,
    idempotency_key: key, thread_key: m.messageId?.slice(0, 300) ?? null, folder: "INBOX",
  }).select("id").single();
  if (ins.error) {
    if (ins.error.code === "23505") {
      const { data } = await admin.from("comm_messages").select("id, contact_id").eq("idempotency_key", key).maybeSingle();
      return { id: (data?.id as string) ?? null, contactId: (data?.contact_id as string | null) ?? null };
    }
    console.error("[zoho] message could not be filed");
    return { id: null, contactId: contact?.id ?? null };
  }
  if (contact) await logInbound(admin, ins.data.id as string, contact.id, m);
  return { id: ins.data.id as string, contactId: contact?.id ?? null };
}

async function logInbound(admin: SupabaseClient, rowId: string, contactId: string, m: FullMessage) {
  await admin.from("activity").insert({
    production_id: null, section: "communications", contact_id: contactId, kind: "email.received",
    summary: `Email received: ${m.subject}`.slice(0, 500), subject_table: "comm_messages", subject_id: rowId,
    details: { channel: "zoho" },
  });
}
