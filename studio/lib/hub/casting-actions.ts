"use server";

import { writeBlockReason } from "./env.ts";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSignedIn, loadSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/sections";
import { dbCheck } from "./data.ts";
import {
  APP_STATUSES, CALL_STATUSES, ROLE_STATUSES, SESSION_KINDS, SESSION_STATUSES, SESSION_KIND_LABEL,
  CASTING_FROM, CREW_FROM, cleanUrl, fillTemplate, firstName, formatStudioTime, isCrewCall, isOneOf, studioLocalToIso, type TemplateVars,
} from "./casting-core.ts";
import { slugify } from "./labels.ts";
import { sendCastingEmail } from "./brevo.ts";
import { APP_COLS, type Application } from "./casting-data.ts";

export type ActionState = { error?: string; done?: string } | undefined;

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const opt = (v: FormDataEntryValue | null, max: number): string | null | false => {
  const s = text(v);
  if (!s) return null;
  return s.length > max ? false : s;
};

function done(msg: string): ActionState {
  revalidatePath("/productions", "layout");
  revalidatePath("/casting");
  return { done: msg };
}

async function canEdit(productionId: string): Promise<boolean> {
  await requireSignedIn();
  return isUuid(productionId) && dbCheck(productionId, "casting", "edit");
}

const NO_EDIT: ActionState = { error: "You need Edit access to Casting on this production." };

// ---------------------------------------------------------------------------
// Casting calls
// ---------------------------------------------------------------------------
export async function saveCall(_: ActionState, form: FormData): Promise<ActionState> {
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  const productionId = text(form.get("production_id"));
  if (!(await canEdit(productionId))) return NO_EDIT;
  const id = text(form.get("id"));
  const title = text(form.get("title"));
  const slug = slugify(text(form.get("public_slug")) || title);
  const status = text(form.get("status")) || "draft";
  const opensRaw = text(form.get("opens_at"));
  const deadlineRaw = text(form.get("deadline"));
  const opens_at = opensRaw ? studioLocalToIso(opensRaw) : null;
  const deadline = deadlineRaw ? studioLocalToIso(deadlineRaw) : null;
  if (!title || title.length > 160) return { error: "Enter a title (up to 160 characters)." };
  if (!isOneOf(CALL_STATUSES, status)) return { error: "Choose a status." };
  if ((opensRaw && !opens_at) || (deadlineRaw && !deadline)) return { error: "Dates must be valid dates and times." };
  if (opens_at && deadline && deadline <= opens_at) return { error: "The deadline must be after the opening time." };
  const long = { summary: 2000, description: 20000, requirements: 20000, instructions: 5000, location: 300, compensation: 500 } as const;
  const fields: Record<string, string | null> = {};
  for (const [k, max] of Object.entries(long)) {
    const v = opt(form.get(k), max);
    if (v === false) return { error: `${k[0].toUpperCase()}${k.slice(1)} is too long (up to ${max} characters).` };
    fields[k] = v;
  }
  const codes = [...new Set(text(form.get("early_access_codes")).split(/[\s,]+/).filter(Boolean).map((c) => c.toUpperCase()))];
  if (codes.length > 10 || codes.some((c) => !/^[A-Z0-9_-]{6,40}$/.test(c))) return { error: "Early-access codes: up to 10, each 6–40 letters, numbers, - or _." };
  const row = { production_id: productionId, title, public_slug: slug, status, opens_at, deadline, early_access_codes: codes, ...fields };
  const { supabase } = await loadSession();
  if (id) {
    if (!isUuid(id)) return { error: "Unknown casting call." };
    const { error } = await supabase.from("casting_calls").update(row).eq("id", id).eq("production_id", productionId);
    if (error) return { error: error.code === "23505" ? "That web address is already used by another casting call." : "The casting call couldn't be saved." };
    return done("Saved.");
  }
  const { data, error } = await supabase.from("casting_calls").insert(row).select("id").single();
  if (error || !data) return { error: error?.code === "23505" ? "That web address is already used by another casting call." : "The casting call couldn't be created." };
  revalidatePath("/productions", "layout");
  redirect(`${text(form.get("return_to")) || "/productions"}/calls/${data.id}`);
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
export async function saveRole(_: ActionState, form: FormData): Promise<ActionState> {
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  const productionId = text(form.get("production_id"));
  if (!(await canEdit(productionId))) return NO_EDIT;
  const id = text(form.get("id"));
  const callId = text(form.get("call_id"));
  if (!isUuid(callId)) return { error: "Unknown casting call." };
  const name = text(form.get("name"));
  if (!name || name.length > 120) return { error: "Enter the role name (up to 120 characters)." };
  const status = text(form.get("status")) || "open";
  if (!isOneOf(ROLE_STATUSES, status)) return { error: "Choose a role status." };
  const ageMin = text(form.get("age_min"));
  const ageMax = text(form.get("age_max"));
  const age = (s: string) => (s === "" ? null : /^\d{1,3}$/.test(s) && Number(s) <= 120 ? Number(s) : NaN);
  const age_min = age(ageMin), age_max = age(ageMax);
  if (Number.isNaN(age_min) || Number.isNaN(age_max)) return { error: "Ages must be whole numbers." };
  if (age_min !== null && age_max !== null && age_max < age_min) return { error: "The top of the age range must be at least the bottom." };
  const deadlineRaw = text(form.get("deadline"));
  const deadline = deadlineRaw ? studioLocalToIso(deadlineRaw) : null;
  if (deadlineRaw && !deadline) return { error: "The deadline must be a valid date and time." };
  const sort = Number(text(form.get("sort")) || "0");
  const fields: Record<string, string | null> = {};
  for (const [k, max] of Object.entries({ role_type: 120, summary: 2000, description: 10000, requirements: 10000 })) {
    const v = opt(form.get(k), max);
    if (v === false) return { error: `That ${k.replace("_", " ")} is too long.` };
    fields[k] = v;
  }
  const row = { call_id: callId, production_id: productionId, name, status, age_min, age_max, deadline, sort: Number.isFinite(sort) ? Math.trunc(sort) : 0, ...fields };
  const { supabase } = await loadSession();
  const q = id
    ? isUuid(id) ? supabase.from("casting_roles").update(row).eq("id", id).eq("production_id", productionId) : null
    : supabase.from("casting_roles").insert(row);
  if (!q) return { error: "Unknown role." };
  const { error } = await q;
  if (error) return { error: error.code === "23505" ? "This casting call already has a role with that name." : "The role couldn't be saved." };
  return done(id ? `Saved ${name}.` : `Added ${name}.`);
}

export async function deleteRole(_: ActionState, form: FormData): Promise<ActionState> {
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  const productionId = text(form.get("production_id"));
  if (!(await canEdit(productionId))) return NO_EDIT;
  const id = text(form.get("id"));
  if (!isUuid(id)) return { error: "Unknown role." };
  const { supabase } = await loadSession();
  const { error } = await supabase.from("casting_roles").delete().eq("id", id).eq("production_id", productionId);
  if (error) return { error: error.code === "23503" ? "This role has applicants, so it can't be removed. Set it to Closed instead." : "The role couldn't be removed." };
  return done("Role removed.");
}

// ---------------------------------------------------------------------------
// Applicants
// ---------------------------------------------------------------------------
async function applicationProduction(id: string): Promise<string | null> {
  if (!isUuid(id)) return null;
  const { supabase } = await loadSession();
  const { data } = await supabase.from("casting_applications").select("production_id").eq("id", id).maybeSingle();
  return (data?.production_id as string | undefined) ?? null;
}

export async function updateApplication(_: ActionState, form: FormData): Promise<ActionState> {
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  const id = text(form.get("id"));
  const productionId = await applicationProduction(id);
  if (!productionId || !(await canEdit(productionId))) return NO_EDIT;
  const status = text(form.get("status"));
  const ratingRaw = text(form.get("rating"));
  if (!isOneOf(APP_STATUSES, status)) return { error: "Choose a status." };
  const rating = ratingRaw === "" ? null : Number(ratingRaw);
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return { error: "Rating is 1 to 5." };
  const { supabase } = await loadSession();
  const { error } = await supabase.from("casting_applications").update({ status, rating }).eq("id", id);
  if (error) return { error: "The change couldn't be saved." };
  return done("Saved.");
}

export async function bulkUpdate(_: ActionState, form: FormData): Promise<ActionState> {
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  const productionId = text(form.get("production_id"));
  if (!(await canEdit(productionId))) return NO_EDIT;
  const ids = form.getAll("ids").map(text).filter(isUuid).slice(0, 500);
  const status = text(form.get("bulk_status"));
  if (ids.length === 0) return { error: "Tick at least one applicant first." };
  if (!isOneOf(APP_STATUSES, status)) return { error: "Choose a status." };
  const { supabase } = await loadSession();
  const { error, count } = await supabase.from("casting_applications").update({ status }, { count: "exact" })
    .in("id", ids).eq("production_id", productionId);
  if (error) return { error: "The change couldn't be saved." };
  return done(`Updated ${count ?? ids.length} applicant${(count ?? ids.length) === 1 ? "" : "s"}.`);
}

export async function addNote(_: ActionState, form: FormData): Promise<ActionState> {
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  const id = text(form.get("application_id"));
  const productionId = await applicationProduction(id);
  if (!productionId || !(await canEdit(productionId))) return NO_EDIT;
  const body = text(form.get("body"));
  if (!body || body.length > 5000) return { error: "Write a note (up to 5,000 characters)." };
  const { supabase } = await loadSession();
  const { error } = await supabase.from("casting_notes").insert({ application_id: id, production_id: productionId, body });
  if (error) return { error: "The note couldn't be saved." };
  return done("Note added.");
}

export async function deleteNote(_: ActionState, form: FormData): Promise<ActionState> {
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  const productionId = text(form.get("production_id"));
  if (!(await canEdit(productionId))) return NO_EDIT;
  const id = text(form.get("id"));
  if (!isUuid(id)) return { error: "Unknown note." };
  const { supabase } = await loadSession();
  const { error } = await supabase.from("casting_notes").delete().eq("id", id);
  if (error) return { error: "Only the note's author or the owner can remove it." };
  return done("Note removed.");
}

export async function saveSession(_: ActionState, form: FormData): Promise<ActionState> {
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  const applicationId = text(form.get("application_id"));
  const productionId = await applicationProduction(applicationId);
  if (!productionId || !(await canEdit(productionId))) return NO_EDIT;
  const id = text(form.get("id"));
  const kind = text(form.get("kind"));
  const status = text(form.get("status")) || "scheduled";
  if (!isOneOf(SESSION_KINDS, kind)) return { error: "Choose what kind of session this is." };
  if (!isOneOf(SESSION_STATUSES, status)) return { error: "Choose a status." };
  const startsRaw = text(form.get("starts_at"));
  const starts_at = startsRaw ? studioLocalToIso(startsRaw) : null;
  if (startsRaw && !starts_at) return { error: "Enter a valid date and time." };
  const linkRaw = text(form.get("meeting_link"));
  const meeting_link = cleanUrl(linkRaw);
  if (linkRaw && !meeting_link) return { error: "The meeting link must start with https://" };
  const location = opt(form.get("location"), 300);
  const notes = opt(form.get("notes"), 5000);
  if (location === false || notes === false) return { error: "That text is too long." };
  const row = { application_id: applicationId, production_id: productionId, kind, status, starts_at, meeting_link, location, notes };
  const { supabase } = await loadSession();
  const { error } = id
    ? await supabase.from("casting_sessions").update(row).eq("id", isUuid(id) ? id : "00000000-0000-0000-0000-000000000000")
    : await supabase.from("casting_sessions").insert(row);
  if (error) return { error: "The session couldn't be saved." };
  // Scheduling a callback or audition moves the applicant along, unless they're further already.
  if (!id && (kind === "callback" || kind === "audition")) {
    await supabase.from("casting_applications").update({ status: kind }).eq("id", applicationId)
      .in("status", ["submitted", "reviewing", "shortlisted", "on_hold", ...(kind === "audition" ? ["callback"] : [])]);
  }
  return done(id ? "Session updated." : `${SESSION_KIND_LABEL[kind]} added.`);
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------
export async function saveTemplate(_: ActionState, form: FormData): Promise<ActionState> {
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  const productionId = text(form.get("production_id"));
  if (!(await canEdit(productionId))) return NO_EDIT;
  const id = text(form.get("id"));
  const name = text(form.get("name"));
  const subject = text(form.get("subject"));
  const body = text(form.get("body"));
  const setsRaw = text(form.get("sets_status"));
  if (!name || name.length > 120) return { error: "Name the template (up to 120 characters)." };
  if (!subject || subject.length > 200) return { error: "Enter a subject (up to 200 characters)." };
  if (!body || body.length > 20000) return { error: "Write the email." };
  if (setsRaw && !isOneOf(APP_STATUSES, setsRaw)) return { error: "Choose a status." };
  const row = { production_id: productionId, name, subject, body, sets_status: setsRaw || null };
  const { supabase } = await loadSession();
  if (id) {
    if (!isUuid(id)) return { error: "Unknown template." };
    const { error } = await supabase.from("casting_templates").update(row).eq("id", id).eq("production_id", productionId);
    if (error) return { error: "The template couldn't be saved." };
    return done(`Saved ${name}.`);
  }
  const key = slugify(name).replace(/-/g, "_").replace(/^[^a-z]+/, "") || "template";
  const { error } = await supabase.from("casting_templates").insert({ ...row, key: `${key}_${Date.now().toString(36)}`, sort: 100 });
  if (error) return { error: "The template couldn't be added." };
  return done(`Added ${name}.`);
}

// ---------------------------------------------------------------------------
// Sending email
// ---------------------------------------------------------------------------
type Ctx = { film: string; roles: Map<string, string>; deadlines: Map<string, string | null> };

async function varsFor(a: Application, ctx: Ctx): Promise<TemplateVars> {
  const { supabase } = await loadSession();
  const { data: s } = await supabase.from("casting_sessions").select("kind, starts_at, location, meeting_link")
    .eq("application_id", a.id).eq("status", "scheduled").order("starts_at", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
  return {
    first_name: firstName(a.full_name),
    full_name: a.full_name,
    role: ctx.roles.get(a.role_id) ?? "",
    film: ctx.film,
    deadline: formatStudioTime(ctx.deadlines.get(a.call_id) ?? null),
    session_kind: s ? SESSION_KIND_LABEL[s.kind as keyof typeof SESSION_KIND_LABEL] ?? "" : "",
    session_time: s ? formatStudioTime(s.starts_at as string | null) : "",
    session_location: s ? [s.location, s.meeting_link].filter(Boolean).join(" · ") : "",
  };
}

export async function sendEmails(_: ActionState, form: FormData): Promise<ActionState> {
  { const blocked = writeBlockReason(); if (blocked) return { error: blocked }; }
  const productionId = text(form.get("production_id"));
  if (!(await canEdit(productionId))) return NO_EDIT;
  const ids = form.getAll("ids").map(text).filter(isUuid).slice(0, 100);
  if (ids.length === 0) return { error: "Choose at least one applicant." };
  const templateId = text(form.get("template_id"));
  const applyStatus = text(form.get("apply_status")) === "on";
  const { supabase } = await loadSession();

  let subject = text(form.get("subject"));
  let body = text(form.get("body"));
  let setsStatus: string | null = null;
  let template: string | null = null;
  if (isUuid(templateId)) {
    const { data: t } = await supabase.from("casting_templates").select("id, subject, body, sets_status")
      .eq("id", templateId).eq("production_id", productionId).maybeSingle();
    if (!t) return { error: "Unknown template." };
    template = t.id as string;
    subject = subject || (t.subject as string);
    body = body || (t.body as string);
    setsStatus = (t.sets_status as string | null) ?? null;
  }
  if (!subject || subject.length > 200) return { error: "Enter a subject." };
  if (!body || body.length > 20000) return { error: "Write the email." };

  const [{ data: apps }, { data: prod }, { data: roles }, { data: calls }] = await Promise.all([
    supabase.from("casting_applications").select(APP_COLS).in("id", ids).eq("production_id", productionId),
    supabase.from("productions").select("title").eq("id", productionId).maybeSingle(),
    supabase.from("casting_roles").select("id, name").eq("production_id", productionId),
    supabase.from("casting_calls").select("id, deadline, public_slug").eq("production_id", productionId),
  ]);
  const ctx: Ctx = {
    film: (prod?.title as string) ?? "",
    roles: new Map((roles ?? []).map((r) => [r.id as string, r.name as string])),
    deadlines: new Map((calls ?? []).map((c) => [c.id as string, c.deadline as string | null])),
  };
  const crewCalls = new Set((calls ?? []).filter((c) => isCrewCall(c.public_slug as string)).map((c) => c.id as string));

  let sent = 0;
  const failed: string[] = [];
  for (const a of (apps ?? []) as Application[]) {
    const vars = await varsFor(a, ctx);
    const s = fillTemplate(subject, vars).replace(/\s+/g, " ").trim();
    const b = fillTemplate(body, vars);
    const r = await sendCastingEmail({ email: a.email, name: a.full_name }, s, b, crewCalls.has(a.call_id));
    await supabase.from("casting_messages").insert({
      application_id: a.id, production_id: productionId, template_id: template, to_email: a.email,
      subject: s, body: b, status: r.ok ? "sent" : "failed",
      provider_id: r.ok ? r.id : null, error: r.ok ? null : r.error,
    });
    if (r.ok) {
      sent++;
      if (applyStatus && setsStatus) await supabase.from("casting_applications").update({ status: setsStatus }).eq("id", a.id);
    } else {
      failed.push(`${a.full_name}: ${r.error}`);
    }
  }
  revalidatePath("/productions", "layout");
  if (failed.length) return { error: `Sent ${sent}. Not sent: ${failed.slice(0, 5).join("; ")}${failed.length > 5 ? "…" : ""}` };
  const froms = [...new Set(((apps ?? []) as Application[]).map((a) => (crewCalls.has(a.call_id) ? CREW_FROM : CASTING_FROM)))];
  return { done: `Sent ${sent} email${sent === 1 ? "" : "s"} from ${froms.join(" and ")}.` };
}
