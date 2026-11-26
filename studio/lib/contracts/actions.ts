"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSession, requireOwner, requireSignedIn, type Me } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/sections";
import { dbCheck } from "@/lib/hub/data";
import { writeBlockReason } from "@/lib/hub/env";
import { hashToken, newToken, publicBase } from "@/lib/hub/links";
import { sendTransactional } from "@/lib/hub/mailer";
import { firstName } from "@/lib/hub/templates";
import { formatStudioTime } from "@/lib/hub/casting-core";
import { FIELDS } from "./library.ts";
import {
  cleanValue, cleanValues, fieldsOf, freeze, identityForTemplate, missingRequired, renderAgreement, sha256, textToClauses, thaw,
  type TemplateBody,
} from "./render.ts";
import { REQUEST_COLS, SIGNATURE_BUCKET, STUDIO_SIGNATURE_PATH, TEMPLATE_COLS, effectiveStatus, ensureLibrary, type RequestRow, type TemplateRow } from "./data.ts";

export type ActionState = { error?: string; done?: string } | undefined;
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
const DEFAULT_DAYS = 14;

async function base(): Promise<string> {
  const h = await headers();
  return publicBase(process.env, h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
}

function revalidate(id?: string) {
  revalidatePath("/contracts", "layout");
  if (id) revalidatePath(`/contracts/${id}`);
  revalidatePath("/productions", "layout");
  revalidatePath("/contacts", "layout");
}

// ---------------------------------------------------------------------------
// Templates (owner)
// ---------------------------------------------------------------------------
export async function seedLibrary(_: ActionState, _form: FormData): Promise<ActionState> {
  await requireOwner();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const { supabase } = await loadSession();
  const n = await ensureLibrary(supabase);
  revalidate();
  return { done: n ? `Added ${n} BLEUSKM draft ${n === 1 ? "template" : "templates"}.` : "The library is already complete." };
}

/** Saves an edit. Editing an approved version creates a new draft version; the approved one keeps working until the new one is approved. */
export async function saveTemplate(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const key = text(form.get("key"));
  const { supabase } = await loadSession();
  const { data: rows } = await supabase.from("contract_templates").select(TEMPLATE_COLS).eq("key", key).order("version", { ascending: false }).limit(1);
  const latest = (rows?.[0] as TemplateRow | undefined);
  if (!latest) return { error: "Unknown template." };
  const parsed = textToClauses(text(form.get("clauses")));
  if (parsed.error) return { error: parsed.error };
  const required = form.getAll("required").map(text).filter((k) => FIELDS[k]);
  const body: TemplateBody = {
    title: cleanValue(form.get("title"), 80) || latest.body.title,
    docLabel: cleanValue(form.get("doc_label"), 80) || latest.body.docLabel,
    signerLabel: cleanValue(form.get("signer_label"), 60) || latest.body.signerLabel,
    party: latest.body.party,
    required: required.length ? required : latest.body.required,
    clauses: parsed.clauses,
    review: cleanValue(form.get("review"), 10000).split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean),
  };
  const unknown = body.party.map((p) => p.field).concat(fieldsOf(body)).find((k) => !FIELDS[k]);
  if (unknown) return { error: `Unknown field ${unknown}.` };
  const name = cleanValue(form.get("name"), 200) || latest.name;
  const note = cleanValue(form.get("change_note"), 1000) || null;
  if (latest.status === "draft") {
    const { error } = await supabase.from("contract_templates").update({ body, name, change_note: note }).eq("id", latest.id).eq("status", "draft");
    if (error) return { error: "Couldn't save the template." };
    revalidate();
    return { done: `Saved draft version ${latest.version}.` };
  }
  const { error } = await supabase.from("contract_templates").insert({
    key, version: latest.version + 1, name, audience: latest.audience, identity_key: latest.identity_key, body, change_note: note,
  });
  if (error) return { error: "Couldn't save the new version." };
  revalidate();
  return { done: `Saved as draft version ${latest.version + 1}. Version ${latest.version} stays in use until you approve the new one.` };
}

export async function approveTemplate(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm you've read this version." };
  const id = text(form.get("id"));
  if (!isUuid(id)) return { error: "Unknown template." };
  const { supabase } = await loadSession();
  const { data, error } = await supabase.from("contract_templates").update({ status: "approved" }).eq("id", id).eq("status", "draft").select("key, version").maybeSingle();
  if (error || !data) return { error: "Only a draft version can be approved." };
  revalidate();
  redirect(`/contracts/templates/${data.key}?v=${data.version}&approved=1`);
}

export async function setAttorneyReview(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const id = text(form.get("id"));
  if (!isUuid(id)) return { error: "Unknown template." };
  const reviewed = form.get("reviewed") === "on";
  const note = cleanValue(form.get("note"), 2000) || null;
  const { supabase } = await loadSession();
  const { error } = await supabase.from("contract_templates").update({ attorney_reviewed: reviewed, attorney_note: note }).eq("id", id);
  if (error) return { error: "Couldn't save." };
  revalidate();
  return { done: reviewed ? "Marked as reviewed by an attorney." : "Saved. This version is shown as not yet attorney-reviewed." };
}

/** The studio's signature for agreements. Stored privately; never on a public path. */
export async function uploadStudioSignature(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const f = form.get("file");
  if (!(f instanceof File) || !f.size) return { error: "Choose a PNG image of your signature." };
  if (f.size > 300_000) return { error: "The image must be under 300 KB." };
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) return { error: "The signature must be a PNG image (ideally a transparent background)." };
  const admin = createAdminClient();
  if (!admin) return { error: "File storage isn't set up (server key missing)." };
  const { error } = await admin.storage.from(SIGNATURE_BUCKET).upload(STUDIO_SIGNATURE_PATH, bytes, { contentType: "image/png", upsert: true });
  if (error) return { error: "Couldn't store the signature." };
  revalidate();
  return { done: "Signature saved privately. It's applied to agreements you approve, only when you choose it." };
}

export async function removeStudioSignature(_: ActionState, _form: FormData): Promise<ActionState> {
  await requireOwner();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const admin = createAdminClient();
  if (!admin) return { error: "File storage isn't set up (server key missing)." };
  await admin.storage.from(SIGNATURE_BUCKET).remove([STUDIO_SIGNATURE_PATH]);
  revalidate();
  return { done: "Removed. Agreements will use your typed name." };
}

// ---------------------------------------------------------------------------
// Agreements
// ---------------------------------------------------------------------------
async function templateFor(supabase: SupabaseClient, key: string): Promise<{ approved: TemplateRow | null; latest: TemplateRow | null }> {
  const { data } = await supabase.from("contract_templates").select(TEMPLATE_COLS).eq("key", key).order("version", { ascending: false });
  const rows = (data ?? []) as TemplateRow[];
  return { approved: rows.find((r) => r.status === "approved") ?? null, latest: rows[0] ?? null };
}

function readValues(form: FormData, body: TemplateBody): Record<string, string> {
  const allowed = [...new Set([...fieldsOf(body), "studio_rep_name", "studio_rep_title"])];
  const raw: Record<string, unknown> = {};
  for (const k of allowed) raw[k] = form.get(`f_${k}`);
  return cleanValues(raw, allowed);
}

export async function createAgreement(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const productionId = text(form.get("production_id"));
  if (!isUuid(productionId) || !(await dbCheck(productionId, "documents", "edit"))) return { error: "You need Edit access to Documents on this production." };
  const { supabase } = await loadSession();
  const t = await templateFor(supabase, text(form.get("template_key")));
  const tpl = t.approved ?? t.latest;
  if (!tpl) return { error: "Choose an agreement template." };
  const values = readValues(form, tpl.body);
  const signerName = cleanValue(form.get("f_recipient_name"), 200) || cleanValue(form.get("signer_name"), 200);
  const signerEmail = text(form.get("signer_email")).toLowerCase();
  if (!signerName) return { error: "Enter the signer's legal name." };
  if (!EMAIL_RE.test(signerEmail)) return { error: "Enter the signer's email address." };
  const opt = (k: string) => (isUuid(text(form.get(k))) ? text(form.get(k)) : null);
  const crew = text(form.get("crew"));
  const { data, error } = await supabase.from("contract_requests").insert({
    production_id: productionId, template_id: tpl.id, template_key: tpl.key, template_version: tpl.version,
    application_id: opt("application_id"), team_id: opt("team_id"), contact_id: opt("contact_id"),
    signer_name: signerName, signer_email: signerEmail,
    identity_key: identityForTemplate(tpl.audience, tpl.identity_key, crew === "1" ? true : crew === "0" ? false : null),
    fields: { ...values, recipient_name: signerName },
  }).select("id").single();
  if (error || !data) return { error: "Couldn't prepare the agreement." };
  revalidate();
  redirect(`/contracts/${data.id}`);
}

export async function saveAgreement(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const id = text(form.get("id"));
  if (!isUuid(id)) return { error: "Unknown agreement." };
  const { supabase } = await loadSession();
  const { data: r } = await supabase.from("contract_requests").select(REQUEST_COLS).eq("id", id).maybeSingle<RequestRow>();
  if (!r) return { error: "Unknown agreement." };
  if (r.status !== "draft" || r.content_text) return { error: "This agreement's wording is already approved. Void it and prepare a new one to change it." };
  const t = await templateFor(supabase, text(form.get("template_key")) || r.template_key);
  const tpl = t.approved ?? t.latest;
  if (!tpl) return { error: "Unknown template." };
  const values = readValues(form, tpl.body);
  const signerName = values.recipient_name || r.signer_name;
  const signerEmail = text(form.get("signer_email")).toLowerCase() || r.signer_email;
  if (!EMAIL_RE.test(signerEmail)) return { error: "Enter a valid email address." };
  const { error } = await supabase.from("contract_requests").update({
    template_id: tpl.id, signer_name: signerName, signer_email: signerEmail, fields: { ...values, recipient_name: signerName },
    identity_key: tpl.key === r.template_key ? r.identity_key : identityForTemplate(tpl.audience, tpl.identity_key, null),
  }).eq("id", id);
  if (error) return { error: "Couldn't save." };
  revalidate(id);
  return { done: "Saved. Check the preview below." };
}

export async function deleteDraft(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const id = text(form.get("id"));
  const { supabase } = await loadSession();
  const { data, error } = await supabase.from("contract_requests").delete().eq("id", id).eq("status", "draft").select("id");
  if (error || !data?.length) return { error: "Only an unsent draft can be deleted." };
  revalidate();
  redirect("/contracts");
}

function inviteEmail(o: { name: string; doc: string; film: string; role: string; link: string; expires: string; reminder?: boolean }) {
  const subject = `${o.reminder ? "Reminder: " : ""}Your ${o.doc} for ${o.film}: please review and sign`;
  const body = [
    `Hi ${firstName(o.name)},`,
    "",
    o.reminder
      ? `A reminder that your ${o.doc} for ${o.film}${o.role ? ` (${o.role})` : ""} is waiting for your signature. Here is a fresh link (any earlier link no longer works):`
      : `BLEUSKM Studios has prepared your ${o.doc} for ${o.film}${o.role ? ` (${o.role})` : ""}. Please read it carefully and sign it here:`,
    "",
    o.link,
    "",
    `This link is personal to you and works until ${o.expires}. Before signing you'll confirm your email address with a one-time code, and you'll receive a signed copy as a PDF by email.`,
    "",
    "If anything in the agreement looks wrong, or you'd like a paper copy, simply reply to this email before signing.",
    "",
    "Warmly,",
    "BLEUSKM Studios",
  ].join("\n");
  return { subject, body };
}

/** Freezes the wording (if not yet), issues a fresh personal link and emails it. */
async function issueAndSend(supabase: SupabaseClient, me: Me, r: RequestRow, o: { days: number; studioImage: boolean; mode: "send" | "remind" | "resend"; origin: string }): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return "Email isn't set up on this deployment (server key missing).";
  let contentText = r.content_text;
  let contentHash = r.content_hash;
  let templateName = "";
  const patch: Record<string, unknown> = {};
  if (!contentText) {
    const t = await templateFor(supabase, r.template_key);
    if (!t.approved) return `The "${t.latest?.name ?? r.template_key}" template hasn't been approved yet. The owner approves it once under Contracts, Templates.`;
    const tpl = t.approved;
    const missing = missingRequired(tpl.body, { ...r.fields, recipient_name: r.signer_name });
    if (missing.length) return `Fill in: ${missing.map((k) => FIELDS[k]?.label ?? k).join(", ")}.`;
    const rendered = renderAgreement({ id: r.id, template: { key: tpl.key, version: tpl.version, name: tpl.name, body: tpl.body }, values: r.fields, signer: { name: r.signer_name, email: r.signer_email } });
    const f = freeze(rendered);
    contentText = f.text; contentHash = f.hash; templateName = tpl.name;
    Object.assign(patch, {
      template_id: tpl.id, content_text: f.text, content_hash: f.hash, approved_by: me.id, approved_at: new Date().toISOString(),
      studio_signer: { name: rendered.studio.name, title: rendered.studio.title, kind: o.studioImage && me.isOwner ? "image" : "typed" },
    });
  }
  const agreement = thaw(contentText, contentHash);
  if (!agreement) return "The agreement's stored wording failed its integrity check. Nothing was sent; please tell the studio owner.";
  templateName ||= agreement.template.name;
  const token = newToken();
  const expires = o.mode === "remind" && r.expires_at ? r.expires_at : new Date(Date.now() + o.days * 86400_000).toISOString();
  Object.assign(patch, { token_hash: hashToken(token), expires_at: expires });
  const { error: upErr } = await supabase.from("contract_requests").update(patch).eq("id", r.id);
  if (upErr) return upErr.code === "23514" ? `Couldn't send: ${upErr.message}` : "Couldn't prepare the agreement for sending.";

  const mail = inviteEmail({ name: r.signer_name, doc: agreement.title,
    film: agreement.production, role: r.fields.role ?? "", link: `${o.origin}/sign/${token}`, expires: formatStudioTime(expires), reminder: o.mode === "remind" });
  const sent = await sendTransactional(admin, {
    identityKey: r.identity_key, to: { email: r.signer_email, name: r.signer_name }, subject: mail.subject, body: mail.body,
    idempotencyKey: `contract-${o.mode}:${r.id}:${hashToken(token).slice(0, 16)}`, contactId: r.contact_id, productionId: r.production_id,
    section: "documents", templateKey: `contract_${o.mode}`, related: { table: "contract_requests", id: r.id }, sentByName: me.fullName,
    activityKind: `contract.email_${o.mode}`, activitySummary: `${templateName} ${o.mode === "remind" ? "reminder" : "signing link"} emailed to ${r.signer_email}`,
  });
  if (sent.status !== "sent") return `The email wasn't sent: ${sent.reason}`;
  const now = new Date().toISOString();
  const next: Record<string, unknown> = o.mode === "remind" ? { reminder_sent_at: now } : { status: "sent", sent_at: now };
  await supabase.from("contract_requests").update(next).eq("id", r.id);
  await admin.from("contract_events").insert({ request_id: r.id, kind: o.mode === "send" ? "email_sent" : o.mode === "remind" ? "reminder_sent" : "link_resent",
    actor: "staff", actor_id: me.id, actor_name: me.fullName, detail: { message_id: sent.messageId, from: r.identity_key, to: r.signer_email } });
  return null;
}

export async function sendAgreement(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  if (form.get("reviewed") !== "on") return { error: "Tick the box to confirm you've reviewed the preview." };
  const ids = form.getAll("id").map(text).filter(isUuid).slice(0, 50);
  if (!ids.length) return { error: "Choose an agreement." };
  const days = Math.min(Math.max(Number(text(form.get("days"))) || DEFAULT_DAYS, 1), 60);
  const { supabase } = await loadSession();
  const origin = await base();
  let ok = 0;
  const failed: string[] = [];
  for (const id of ids) {
    const { data: r } = await supabase.from("contract_requests").select(REQUEST_COLS).eq("id", id).maybeSingle<RequestRow>();
    if (!r || !(await dbCheck(r.production_id, "documents", "edit"))) { failed.push("an agreement you can't edit"); continue; }
    if (r.status !== "draft") { failed.push(`${r.signer_name}: already ${r.status}`); continue; }
    const err = await issueAndSend(supabase, me, r, { days, studioImage: form.get("studio_image") === "on", mode: "send", origin });
    if (err) failed.push(`${r.signer_name}: ${err}`); else ok++;
  }
  revalidate(ids.length === 1 ? ids[0] : undefined);
  if (failed.length) return { error: `Sent ${ok}. Not sent: ${failed.slice(0, 5).join("; ")}` };
  if (ids.length === 1) redirect(`/contracts/${ids[0]}?sent=1`);
  return { done: ok === 1 ? "Sent. The signer has a personal link by email." : `Sent ${ok} agreements.` };
}

export async function remindAgreement(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const resend = form.get("mode") === "resend";
  const { supabase } = await loadSession();
  const { data: r } = await supabase.from("contract_requests").select(REQUEST_COLS).eq("id", text(form.get("id"))).maybeSingle<RequestRow>();
  if (!r) return { error: "Unknown agreement." };
  if (!(await dbCheck(r.production_id, "documents", "edit"))) return { error: "You need Edit access to Documents on this production." };
  const state = effectiveStatus(r);
  if (resend ? !["sent", "viewed", "expired"].includes(state) : !["sent", "viewed"].includes(state)) {
    return { error: resend ? "Only a sent or expired agreement can be re-sent." : "Only an open agreement can be reminded." };
  }
  if (!resend && r.reminder_sent_at && Date.now() - Date.parse(r.reminder_sent_at) < 3600_000) return { error: "A reminder already went out in the last hour." };
  const days = Math.min(Math.max(Number(text(form.get("days"))) || DEFAULT_DAYS, 1), 60);
  const err = await issueAndSend(supabase, me, r, { days, studioImage: false, mode: resend ? "resend" : "remind", origin: await base() });
  revalidate(r.id);
  return err ? { error: err } : { done: resend ? `Re-sent with a fresh link, valid ${days} days.` : "Reminder sent with a fresh link (the old one no longer works)." };
}

export async function voidAgreement(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const reason = cleanValue(form.get("reason"), 1000);
  if (!reason) return { error: "Say why it's being voided (kept in the audit trail)." };
  const { supabase } = await loadSession();
  const id = text(form.get("id"));
  const { data, error } = await supabase.from("contract_requests").update({ status: "voided", void_reason: reason })
    .eq("id", id).in("status", ["sent", "viewed", "expired"]).select("id");
  if (error || !data?.length) return { error: "Only a sent, unsigned agreement can be voided." };
  revalidate(id);
  redirect(`/contracts/${id}?voided=1`);
}

/** Checks a PDF someone has against the stored fingerprint of the signed original. */
export async function verifyCopy(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const id = text(form.get("id"));
  const f = form.get("file");
  if (!(f instanceof File) || !f.size) return { error: "Choose the PDF to check." };
  if (f.size > 20_000_000) return { error: "That file is too large to be one of our agreements." };
  const { supabase } = await loadSession();
  const { data: r } = await supabase.from("contract_requests").select("id, pdf_sha256, production_id").eq("id", id).maybeSingle();
  if (!r?.pdf_sha256) return { error: "This agreement has no signed PDF yet." };
  const hash = sha256(new Uint8Array(await f.arrayBuffer()));
  const admin = createAdminClient();
  const match = hash === r.pdf_sha256;
  await admin?.from("contract_events").insert({ request_id: id, kind: match ? "copy_verified" : "copy_mismatch", actor: "staff", detail: { sha256: hash } });
  return match
    ? { done: `Verified: this PDF is identical to the signed original (SHA-256 ${hash.slice(0, 16)}…).` }
    : { error: `Not a match. This file differs from the signed original (its SHA-256 is ${hash.slice(0, 16)}…), so it has been changed or is a different document.` };
}
