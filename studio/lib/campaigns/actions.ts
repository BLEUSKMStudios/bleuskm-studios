"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadSession, requireSignedIn } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/sections";
import { dbCheck } from "@/lib/hub/data";
import { writeBlockReason } from "@/lib/hub/env";
import { hashToken, newToken, publicBase } from "@/lib/hub/links";
import { sendTransactional } from "@/lib/hub/mailer";
import { marketingEligible } from "@/lib/hub/mail-rules";
import { BATCH, campaignBlockReason, campaignFooter, personalize, postalAddress, unknownFields } from "./rules.ts";

type ActionState = { error?: string; done?: string } | undefined;
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const IDENTITIES = new Set(["newsletter", "films", "studio"]);

async function canEdit(): Promise<string | null> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return blocked;
  if (!(await dbCheck(null, "communications", "edit"))) return "You need Studio-level Edit access to Communications.";
  return null;
}

/** Creates or updates a draft campaign. */
export async function saveCampaign(_: ActionState, form: FormData): Promise<ActionState> {
  const no = await canEdit();
  if (no) return { error: no };
  const id = text(form.get("id"));
  const row = {
    name: text(form.get("name")).slice(0, 200),
    audience_id: text(form.get("audience_id")),
    identity_key: text(form.get("identity_key")),
    subject: text(form.get("subject")).slice(0, 300),
    preview_text: text(form.get("preview_text")).slice(0, 300) || null,
    body: text(form.get("body")).replace(/\r\n?/g, "\n").slice(0, 50000),
  };
  if (!row.name) return { error: "Give the campaign a name (only you see it)." };
  if (!isUuid(row.audience_id)) return { error: "Choose who it goes to." };
  if (!IDENTITIES.has(row.identity_key)) return { error: "Choose the sender." };
  if (!row.subject) return { error: "Write a subject line." };
  if (!row.body) return { error: "Write the email." };
  const { supabase } = await loadSession();
  if (id) {
    if (!isUuid(id)) return { error: "Unknown campaign." };
    const { error } = await supabase.from("campaigns").update(row).eq("id", id).in("status", ["draft", "submitted", "approved"]);
    if (error) return { error: error.message.includes("marketing") ? "Campaigns go only to audiences people opted in to." : "Couldn't save. A campaign that is sending or sent can't be edited." };
    revalidatePath(`/communications/campaigns/${id}`);
    return { done: "Saved. If it was submitted or approved, it's back to draft and needs approval again." };
  }
  const { data, error } = await supabase.from("campaigns").insert(row).select("id").single();
  if (error || !data) return { error: error?.message.includes("marketing") ? "Campaigns go only to audiences people opted in to." : "Couldn't create the campaign." };
  redirect(`/communications/campaigns/${data.id}?created=1`);
}

async function setStatus(form: FormData, to: string, from: string[], msg: string): Promise<ActionState> {
  const no = await canEdit();
  if (no) return { error: no };
  const id = text(form.get("id"));
  if (!isUuid(id)) return { error: "Unknown campaign." };
  const { supabase } = await loadSession();
  const { data, error } = await supabase.from("campaigns").update({ status: to }).eq("id", id).in("status", from).select("id");
  if (error) return { error: error.code === "42501" ? "Only the owner can approve campaigns." : error.message.slice(0, 200) };
  if (!data?.length) return { error: "That isn't possible from the campaign's current state. Reload the page." };
  revalidatePath(`/communications/campaigns/${id}`);
  return { done: msg };
}

export async function submitCampaign(_: ActionState, form: FormData): Promise<ActionState> {
  return setStatus(form, "submitted", ["draft"], "Submitted. The owner approves it before it can be sent.");
}
export async function withdrawCampaign(_: ActionState, form: FormData): Promise<ActionState> {
  return setStatus(form, "draft", ["submitted", "approved"], "Back to draft.");
}
export async function cancelCampaign(_: ActionState, form: FormData): Promise<ActionState> {
  return setStatus(form, "cancelled", ["draft", "submitted", "approved", "sending"], "Cancelled. Nothing more will be sent.");
}

/** The owner approves the exact wording, audience and sender. */
export async function approveCampaign(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSignedIn();
  if (!me.isOwner) return { error: "Only the owner can approve campaigns." };
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm you've read the preview." };
  const { supabase } = await loadSession();
  const { data: c } = await supabase.from("campaigns").select("subject, body, preview_text").eq("id", text(form.get("id"))).maybeSingle();
  if (c) {
    const bad = unknownFields(`${c.subject}\n${c.preview_text ?? ""}\n${c.body}`);
    if (bad.length) return { error: `The wording has fields Studio OS can't fill: ${bad.map((b) => `{{${b}}}`).join(", ")}. Edit them first.` };
  }
  return setStatus(form, "approved", ["submitted"], "Approved. It can now be sent.");
}

async function siteBase(): Promise<string> {
  const h = await headers();
  return publicBase(process.env, h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
}

/** A test email to yourself, with the footer exactly as subscribers will see it. */
export async function sendCampaignTest(_: ActionState, form: FormData): Promise<ActionState> {
  const no = await canEdit();
  if (no) return { error: no };
  const me = await requireSignedIn();
  const id = text(form.get("id"));
  const { supabase } = await loadSession();
  const { data: c } = await supabase.from("campaigns").select("id, name, subject, preview_text, body, identity_key, audience_id, status, updated_at").eq("id", id).maybeSingle();
  if (!c) return { error: "Unknown campaign." };
  const admin = createAdminClient();
  if (!admin) return { error: "Email isn't set up on this deployment (server key missing)." };
  const { data: aud } = await admin.from("audiences").select("name").eq("id", c.audience_id).maybeSingle();
  const body = personalize(c.body as string, { name: me.fullName }) + "\n" + campaignFooter({
    audience: (aud?.name as string) ?? "our updates", address: postalAddress(process.env) || "[studio mailing address]", unsubscribeUrl: `${await siteBase()}/u/test-link`,
  });
  const out = await sendTransactional(admin, {
    identityKey: c.identity_key as string, to: { email: me.email, name: me.fullName },
    subject: `[TEST] ${personalize(c.subject as string, { name: me.fullName })}`, previewText: c.preview_text as string | null, body,
    idempotencyKey: `campaign-test:${c.id}:${Date.parse(c.updated_at as string)}:${me.id}:${Date.now()}`, section: "communications",
    templateKey: "campaign_test", related: { table: "campaigns", id: c.id as string }, sentByName: me.fullName,
    activityKind: "campaign.test", activitySummary: `Test of campaign "${c.name}" sent to ${me.email}`, tags: ["studio-os-campaign-test"],
  });
  if (out.status !== "sent") return { error: `The test wasn't sent: ${out.reason}` };
  await admin.from("campaigns").update({ test_sent_at: new Date().toISOString(), test_sent_to: me.email }).eq("id", c.id);
  revalidatePath(`/communications/campaigns/${id}`);
  return { done: `Test sent to ${me.email}.` };
}

/**
 * Sends an approved campaign: everyone currently subscribed and deliverable,
 * once each, up to BATCH per run ("Continue sending" picks up the rest).
 */
export async function sendCampaign(_: ActionState, form: FormData): Promise<ActionState> {
  const no = await canEdit();
  if (no) return { error: no };
  const off = campaignBlockReason(process.env);
  if (off) return { error: off };
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm the send." };
  const me = await requireSignedIn();
  const id = text(form.get("id"));
  const { supabase } = await loadSession();
  const admin = createAdminClient();
  if (!admin) return { error: "Email isn't set up on this deployment (server key missing)." };
  const { data: c } = await supabase.from("campaigns").select("id, name, subject, preview_text, body, identity_key, audience_id, status").eq("id", id).maybeSingle();
  if (!c) return { error: "Unknown campaign." };
  if (c.status === "approved") {
    // The database checks that the wording is exactly what the owner approved.
    const { error } = await supabase.from("campaigns").update({ status: "sending" }).eq("id", id).eq("status", "approved");
    if (error) return { error: "Only the approved wording can be sent. Ask the owner to approve it again." };
    // Recipients: subscribed now, deliverable, once each.
    const { data: subs } = await admin.from("contact_subscriptions")
      .select("status, contacts!inner(id, email, email_status, merged_into)").eq("audience_id", c.audience_id).eq("status", "subscribed").limit(20000);
    const seen = new Set<string>();
    const rows: { campaign_id: string; contact_id: string; email: string }[] = [];
    for (const s of subs ?? []) {
      const ct = s.contacts as unknown as { id: string; email: string | null; email_status: string; merged_into: string | null };
      if (!marketingEligible({ status: s.status as string }, ct) || seen.has(ct.email!)) continue;
      seen.add(ct.email!);
      rows.push({ campaign_id: id, contact_id: ct.id, email: ct.email! });
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error: insErr } = await supabase.from("campaign_recipients").upsert(rows.slice(i, i + 500), { onConflict: "campaign_id,contact_id", ignoreDuplicates: true });
      if (insErr) return { error: "Couldn't prepare the recipient list. Nothing was sent." };
    }
    await admin.from("campaigns").update({ recipient_count: rows.length }).eq("id", id);
  } else if (c.status !== "sending") {
    return { error: "Only an approved campaign can be sent." };
  }

  const { data: aud } = await admin.from("audiences").select("name").eq("id", c.audience_id).maybeSingle();
  const { data: queue } = await admin.from("campaign_recipients").select("id, contact_id, email, contacts(full_name)").eq("campaign_id", id).eq("status", "queued").limit(BATCH);
  const base = await siteBase();
  const address = postalAddress(process.env);
  let sent = 0, failed = 0;
  for (const r of queue ?? []) {
    // Still subscribed right now? (Someone may have unsubscribed since the list was made.)
    const { data: sub } = await admin.from("contact_subscriptions").select("status").eq("contact_id", r.contact_id).eq("audience_id", c.audience_id).maybeSingle();
    if (sub?.status !== "subscribed") { await admin.from("campaign_recipients").update({ status: "skipped", error: "Unsubscribed before sending" }).eq("id", r.id); continue; }
    const token = newToken();
    await admin.from("campaign_recipients").update({ token_hash: hashToken(token) }).eq("id", r.id);
    const name = (r.contacts as unknown as { full_name: string } | null)?.full_name ?? null;
    const unsubscribeUrl = `${base}/u/${token}`;
    const out = await sendTransactional(admin, {
      identityKey: c.identity_key as string, to: { email: r.email as string, name },
      subject: personalize(c.subject as string, { name }), previewText: c.preview_text as string | null,
      body: personalize(c.body as string, { name }) + "\n" + campaignFooter({ audience: (aud?.name as string) ?? "our updates", address, unsubscribeUrl }),
      unsubscribeUrl, idempotencyKey: `campaign:${id}:${r.contact_id}`, contactId: r.contact_id as string, section: "communications",
      templateKey: "campaign", related: { table: "campaigns", id }, sentByName: me.fullName, tags: [`studio-os-campaign-${id.slice(0, 8)}`],
      activityKind: "campaign.email", activitySummary: `Campaign "${c.name}" emailed`,
    });
    const status = out.status === "sent" ? "sent" : out.status === "skipped" ? "skipped" : out.status === "blocked" ? "blocked" : "failed";
    await admin.from("campaign_recipients").update({ status, message_id: out.messageId, error: out.status === "sent" ? null : out.reason.slice(0, 500) }).eq("id", r.id);
    if (status === "sent") sent++; else failed++;
  }
  const { count: left } = await admin.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "queued");
  if (!left) await supabase.from("campaigns").update({ status: "sent" }).eq("id", id).eq("status", "sending");
  revalidatePath(`/communications/campaigns/${id}`);
  return { done: `Sent ${sent}${failed ? `, ${failed} not sent (see the list)` : ""}.${left ? ` ${left} still to send: use Continue sending (Brevo's free plan allows 300 a day).` : " All done."}` };
}
