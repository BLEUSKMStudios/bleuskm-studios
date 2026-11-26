"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { loadSession, requireSignedIn } from "@/lib/auth/session";
import { isUuid } from "@/lib/sections";
import { dbCheck } from "./data.ts";
import { writeBlockReason } from "./env.ts";
import { firstName, formatStudioTime, isCrewCall, studioLocalToIso } from "./casting-core.ts";
import { deliverToApplicant } from "./casting-mail.ts";
import { hashToken, newToken, publicBase } from "./links.ts";
import { render } from "./templates.ts";
import { cleanTapeLink } from "./selftape.ts";

export type ActionState = { error?: string; done?: string } | undefined;
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

// Statuses before the self-tape step: inviting moves these forward, never back.
const BEFORE_TAPE = new Set(["submitted", "reviewing", "shortlisted", "on_hold"]);

async function base(): Promise<string> {
  const h = await headers();
  return publicBase(process.env, h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
}

type App = { id: string; production_id: string; call_id: string; role_id: string; full_name: string; email: string; status: string };

/**
 * Invite one or more applicants to send a self-tape: a personal, secure
 * upload link, instructions, deadline and sides, emailed from casting@ (or
 * crew@ for crew calls). The email is prepared from the production's
 * "Self-tape invitation" template and can be edited before sending.
 */
export async function inviteToSelfTape(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const productionId = text(form.get("production_id"));
  if (!isUuid(productionId) || !(await dbCheck(productionId, "casting", "edit"))) return { error: "You need Edit access to Casting on this production." };
  const ids = form.getAll("ids").map(text).filter(isUuid).slice(0, 100);
  if (!ids.length) return { error: "Choose at least one applicant." };
  const deadlineLocal = text(form.get("deadline"));
  const deadline = deadlineLocal ? studioLocalToIso(deadlineLocal) : null;
  if (deadlineLocal && !deadline) return { error: "Enter the deadline as a date and time." };
  if (deadline && Date.parse(deadline) < Date.now()) return { error: "The deadline is in the past." };
  const instructions = text(form.get("instructions")).slice(0, 10000);
  const sidesRaw = text(form.get("sides_url"));
  const sides = sidesRaw ? cleanTapeLink(sidesRaw) : null;
  if (sidesRaw && !sides) return { error: "The sides link must be an https:// address." };
  const sidesDoc = isUuid(text(form.get("sides_document_id"))) ? text(form.get("sides_document_id")) : null;
  const treatmentDoc = isUuid(text(form.get("treatment_document_id"))) ? text(form.get("treatment_document_id")) : null;
  const sendId = /^[\w-]{8,64}$/.test(text(form.get("send_id"))) ? text(form.get("send_id")) : crypto.randomUUID();

  const { supabase } = await loadSession();
  const [{ data: apps }, { data: prod }, { data: roles }, { data: calls }, { data: tpl }] = await Promise.all([
    supabase.from("casting_applications").select("id, production_id, call_id, role_id, full_name, email, status").in("id", ids).eq("production_id", productionId),
    supabase.from("productions").select("title").eq("id", productionId).maybeSingle(),
    supabase.from("casting_roles").select("id, name").eq("production_id", productionId),
    supabase.from("casting_calls").select("id, public_slug").eq("production_id", productionId),
    supabase.from("casting_templates").select("id, subject, body").eq("production_id", productionId).eq("key", "selftape_invite").maybeSingle(),
  ]);
  const subjectT = text(form.get("subject")) || (tpl?.subject as string | undefined) || "Self-tape request: {{role}} in {{film}}";
  const bodyT = text(form.get("body")) || (tpl?.body as string | undefined) || "Hi {{first_name}},\n\n{{instructions}}\n\nUpload here: {{upload_link}}";
  if (!bodyT.includes("{{upload_link}}")) return { error: "The email must include {{upload_link}}, so each person gets their own secure upload link." };
  const roleName = new Map((roles ?? []).map((r) => [r.id as string, r.name as string]));
  const crewCall = new Set((calls ?? []).filter((c) => isCrewCall(c.public_slug as string)).map((c) => c.id as string));
  const origin = await base();

  let sent = 0;
  const failed: string[] = [];
  for (const a of (apps ?? []) as App[]) {
    // One invitation per applicant per send: a re-submitted form reuses it.
    const token = newToken();
    const { data: inv, error } = await supabase.from("selftape_invitations").insert({
      application_id: a.id, production_id: productionId, token_hash: hashToken(token), instructions: instructions || null,
      deadline, sides_url: sides, sides_document_id: sidesDoc, treatment_document_id: treatmentDoc, status: "draft",
    }).select("id").single();
    if (error || !inv) { failed.push(`${a.full_name}: couldn't create the invitation`); continue; }
    const link = `${origin}/upload/${token}`;
    const vars = {
      first_name: firstName(a.full_name), full_name: a.full_name, role: roleName.get(a.role_id) ?? "", film: (prod?.title as string) ?? "",
      deadline: deadline ? formatStudioTime(deadline) : "the date we agreed", instructions,
      sides_link: sides ?? (sidesDoc ? link : ""), treatment_link: treatmentDoc ? link : "", upload_link: link,
    };
    const subject = render(subjectT, vars).replace(/\s+/g, " ").trim();
    const body = render(bodyT, vars);
    const r = await deliverToApplicant(supabase, {
      application: a, crew: crewCall.has(a.call_id), subject, body, templateId: (tpl?.id as string | undefined) ?? null,
      templateKey: "selftape_invite", sendKey: `selftape-invite:${sendId}:${a.id}`, sentByName: me.fullName, activityKind: "selftape.invited",
    });
    if (r.ok && r.skipped) {
      await supabase.from("selftape_invitations").update({ status: "cancelled" }).eq("id", inv.id);
      continue;
    }
    if (!r.ok) {
      await supabase.from("selftape_invitations").update({ status: "cancelled" }).eq("id", inv.id);
      failed.push(`${a.full_name}: ${r.error}`);
      continue;
    }
    sent++;
    // Older open invitations for this applicant stop working: only the newest link counts.
    await supabase.from("selftape_invitations").update({ status: "cancelled" })
      .eq("application_id", a.id).neq("id", inv.id).in("status", ["draft", "sent", "opened"]);
    await supabase.from("selftape_invitations").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", inv.id);
    if (BEFORE_TAPE.has(a.status)) await supabase.from("casting_applications").update({ status: "selftape_invited" }).eq("id", a.id);
  }
  revalidatePath("/productions", "layout");
  revalidatePath("/casting");
  if (failed.length) return { error: `Invited ${sent}. Not sent: ${failed.slice(0, 5).join("; ")}${failed.length > 5 ? "…" : ""}` };
  return { done: `Invited ${sent} ${sent === 1 ? "person" : "people"} to send a self-tape.` };
}

/** A reminder with a fresh link (the old link stops working). */
export async function remindSelfTape(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const id = text(form.get("invitation_id"));
  if (!isUuid(id)) return { error: "Unknown invitation." };
  const { supabase } = await loadSession();
  const { data: inv } = await supabase.from("selftape_invitations").select("id, production_id, application_id, status, deadline, reminder_sent_at").eq("id", id).maybeSingle();
  if (!inv) return { error: "Unknown invitation." };
  if (!(await dbCheck(inv.production_id as string, "casting", "edit"))) return { error: "You need Edit access to Casting on this production." };
  if (!["sent", "opened"].includes(inv.status as string)) return { error: "Only an open invitation can be reminded." };
  if (inv.reminder_sent_at && Date.now() - Date.parse(inv.reminder_sent_at as string) < 3600_000) return { error: "A reminder already went out in the last hour." };
  const [{ data: a }, { data: tpl }, { data: prod }] = await Promise.all([
    supabase.from("casting_applications").select("id, production_id, call_id, role_id, full_name, email, status").eq("id", inv.application_id).single(),
    supabase.from("casting_templates").select("id, subject, body").eq("production_id", inv.production_id).eq("key", "selftape_reminder").maybeSingle(),
    supabase.from("productions").select("title").eq("id", inv.production_id).maybeSingle(),
  ]);
  if (!a) return { error: "Unknown applicant." };
  const [{ data: role }, { data: call }] = await Promise.all([
    supabase.from("casting_roles").select("name").eq("id", a.role_id).maybeSingle(),
    supabase.from("casting_calls").select("public_slug").eq("id", a.call_id).maybeSingle(),
  ]);
  const token = newToken();
  const link = `${await base()}/upload/${token}`;
  const vars = { first_name: firstName(a.full_name as string), role: (role?.name as string) ?? "", film: (prod?.title as string) ?? "",
    deadline: inv.deadline ? formatStudioTime(inv.deadline as string) : "the date we agreed", upload_link: link };
  const subject = render((tpl?.subject as string) ?? "Reminder: your self-tape for {{film}}", vars);
  const body = render((tpl?.body as string) ?? "Hi {{first_name}},\n\nYour upload link: {{upload_link}}", vars);
  await supabase.from("selftape_invitations").update({ token_hash: hashToken(token) }).eq("id", id);
  const r = await deliverToApplicant(supabase, {
    application: a as App, crew: isCrewCall(call?.public_slug as string), subject, body, templateId: (tpl?.id as string | undefined) ?? null,
    templateKey: "selftape_reminder", sendKey: `selftape-reminder:${id}:${Math.floor(Date.now() / 3600_000)}`, sentByName: me.fullName, activityKind: "selftape.reminded",
  });
  if (!r.ok) return { error: r.error };
  await supabase.from("selftape_invitations").update({ reminder_sent_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/productions", "layout");
  return { done: "Reminder sent with a fresh link." };
}

export async function cancelSelfTape(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSignedIn();
  const blocked = writeBlockReason();
  if (blocked) return { error: blocked };
  const id = text(form.get("invitation_id"));
  if (!isUuid(id)) return { error: "Unknown invitation." };
  const { supabase } = await loadSession();
  const { data, error } = await supabase.from("selftape_invitations").update({ status: "cancelled" }).eq("id", id).in("status", ["draft", "sent", "opened"]).select("id");
  if (error || !data?.length) return { error: "Couldn't cancel this invitation." };
  revalidatePath("/productions", "layout");
  return { done: "Cancelled. The link no longer works." };
}
