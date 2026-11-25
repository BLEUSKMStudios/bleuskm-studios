import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LIBRARY, templateByKey } from "./library.ts";
import { fieldsOf, libraryBody, recommendTemplate, type TemplateBody, type Values } from "./render.ts";

export const TEMPLATE_COLS = "id, key, version, name, audience, identity_key, body, status, approved_by, approved_at, attorney_reviewed, attorney_note, change_note, created_at, updated_at";
export type TemplateRow = {
  id: string; key: string; version: number; name: string; audience: "cast" | "crew" | "other"; identity_key: string;
  body: TemplateBody; status: "draft" | "approved" | "retired"; approved_by: string | null; approved_at: string | null;
  attorney_reviewed: boolean; attorney_note: string | null; change_note: string | null; created_at: string; updated_at: string;
};

export const REQUEST_COLS = "id, production_id, template_id, template_key, template_version, application_id, team_id, contact_id, signer_name, signer_email, identity_key, fields, content_text, content_hash, status, expires_at, studio_signer, approved_by, approved_at, sent_at, viewed_at, reminder_sent_at, voided_at, void_reason, signed_at, signed_name, signature_kind, signature_path, consent_at, verified_at, signer_ip, signer_agent, pdf_path, pdf_sha256, document_id, created_at, updated_at";
export type RequestRow = {
  id: string; production_id: string; template_id: string; template_key: string; template_version: number;
  application_id: string | null; team_id: string | null; contact_id: string | null;
  signer_name: string; signer_email: string; identity_key: string; fields: Values;
  content_text: string | null; content_hash: string | null;
  status: "draft" | "sent" | "viewed" | "signed" | "declined" | "voided" | "expired";
  expires_at: string | null; studio_signer: { name: string; title: string; kind: "typed" | "image" } | null;
  approved_by: string | null; approved_at: string | null; sent_at: string | null; viewed_at: string | null;
  reminder_sent_at: string | null; voided_at: string | null; void_reason: string | null;
  signed_at: string | null; signed_name: string | null; signature_kind: "typed" | "drawn" | null; signature_path: string | null;
  consent_at: string | null; verified_at: string | null; signer_ip: string | null; signer_agent: string | null;
  pdf_path: string | null; pdf_sha256: string | null; document_id: string | null; created_at: string; updated_at: string;
};

export const STATUS_LABEL: Record<RequestRow["status"], string> = {
  draft: "Draft", sent: "Sent", viewed: "Opened", signed: "Signed", declined: "Declined", voided: "Voided", expired: "Expired",
};
export const STATUS_TONE: Record<RequestRow["status"], string> = {
  draft: "muted", sent: "info", viewed: "warn", signed: "good", declined: "bad", voided: "muted", expired: "bad",
};

/** Expired is shown as soon as the link's time is up, before anything records it. */
export function effectiveStatus(r: Pick<RequestRow, "status" | "expires_at">, now = Date.now()): RequestRow["status"] {
  if ((r.status === "sent" || r.status === "viewed") && r.expires_at && Date.parse(r.expires_at) < now) return "expired";
  return r.status;
}

/** The studio's signature image (owner upload), kept private in storage. */
export const STUDIO_SIGNATURE_PATH = "contracts/studio/signature.png";
export const SIGNATURE_BUCKET = "production-files";

/** The owner's library starts from the BLEUSKM drafts: any missing template is added as version 1 (draft). */
export async function ensureLibrary(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from("contract_templates").select("key");
  const have = new Set((data ?? []).map((r) => r.key as string));
  const missing = LIBRARY.filter((t) => !have.has(t.key));
  if (!missing.length) return 0;
  const { error } = await supabase.from("contract_templates").insert(missing.map((t) => ({
    key: t.key, version: 1, name: t.name, audience: t.audience, identity_key: t.identity, body: libraryBody(t),
    change_note: "BLEUSKM draft prepared in Studio OS (not yet reviewed by an attorney).",
  })));
  return error ? 0 : missing.length;
}

/** Per template key: the newest version and the approved one. */
export function byKey(rows: TemplateRow[]): { key: string; latest: TemplateRow; approved: TemplateRow | null }[] {
  const m = new Map<string, { key: string; latest: TemplateRow; approved: TemplateRow | null }>();
  for (const r of rows) {
    const e = m.get(r.key) ?? { key: r.key, latest: r, approved: null };
    if (r.version > e.latest.version) e.latest = r;
    if (r.status === "approved") e.approved = r;
    m.set(r.key, e);
  }
  const order = new Map(LIBRARY.map((t, i) => [t.key, i]));
  return [...m.values()].sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99) || a.key.localeCompare(b.key));
}

export async function loadTemplates(supabase: SupabaseClient): Promise<TemplateRow[]> {
  const { data } = await supabase.from("contract_templates").select(TEMPLATE_COLS).order("key").order("version", { ascending: false });
  return (data ?? []) as TemplateRow[];
}

const fmtDate = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${d}T12:00:00Z`));

/** Shoot dates from the production's schedule (shoot days), when there are any. */
export function shootDatesFrom(rows: { starts_on: string | null; ends_on: string | null; date_label: string | null }[]): string {
  const days = rows.flatMap((r) => [r.starts_on, r.ends_on]).filter((d): d is string => !!d).sort();
  if (days.length) return days[0] === days[days.length - 1] ? fmtDate(days[0]) : `${fmtDate(days[0])} to ${fmtDate(days[days.length - 1])}`;
  const labels = rows.map((r) => r.date_label).filter(Boolean);
  return labels.length ? labels.join("; ") : "";
}

export type Prefill = {
  productionId: string; productionTitle: string;
  signerName: string; signerEmail: string;
  applicationId: string | null; teamId: string | null; contactId: string | null;
  crew: boolean | null; role: string; recommended: string; values: Values;
};

/**
 * Everything Studio OS already knows about the person and production, read
 * with the signed-in person's own access (RLS).
 */
export async function prefill(supabase: SupabaseClient, q: { application?: string; team?: string; contact?: string; production?: string },
  me: { fullName: string; isOwner: boolean }): Promise<Prefill | null> {
  let productionId = q.production ?? "";
  let signerName = "", signerEmail = "", role = "", department = "";
  let crew: boolean | null = null;
  let applicationId: string | null = null, teamId: string | null = null, contactId: string | null = q.contact ?? null;

  if (q.application) {
    const { data: a } = await supabase.from("casting_applications").select("id, production_id, call_id, role_id, full_name, email, contact_id").eq("id", q.application).maybeSingle();
    if (!a) return null;
    applicationId = a.id as string; productionId = a.production_id as string; signerName = a.full_name as string; signerEmail = a.email as string;
    contactId = (a.contact_id as string | null) ?? contactId;
    const [{ data: r }, { data: c }, { data: t }] = await Promise.all([
      supabase.from("casting_roles").select("name").eq("id", a.role_id).maybeSingle(),
      supabase.from("casting_calls").select("public_slug").eq("id", a.call_id).maybeSingle(),
      supabase.from("production_team").select("id, department").eq("application_id", a.id).maybeSingle(),
    ]);
    role = (r?.name as string) ?? ""; crew = /-crew$/.test((c?.public_slug as string) ?? "");
    teamId = (t?.id as string | undefined) ?? null; department = (t?.department as string | null) ?? "";
  } else if (q.team) {
    const { data: t } = await supabase.from("production_team").select("id, production_id, full_name, email, position, team, department, contact_id, application_id").eq("id", q.team).maybeSingle();
    if (!t) return null;
    teamId = t.id as string; productionId = t.production_id as string; signerName = t.full_name as string; signerEmail = (t.email as string | null) ?? "";
    role = t.position as string; department = (t.department as string | null) ?? ""; crew = t.team === "crew" || t.team === "producer" ? true : t.team === "cast" ? false : null;
    contactId = (t.contact_id as string | null) ?? contactId; applicationId = (t.application_id as string | null) ?? null;
  } else if (q.contact) {
    const { data: c } = await supabase.from("contacts").select("id, full_name, email").eq("id", q.contact).maybeSingle();
    if (!c) return null;
    signerName = c.full_name as string; signerEmail = (c.email as string | null) ?? "";
  }
  if (!productionId) return null;
  const [{ data: p }, { data: days }, { data: locs }] = await Promise.all([
    supabase.from("productions").select("title").eq("id", productionId).maybeSingle(),
    supabase.from("schedule_events").select("starts_on, ends_on, date_label").eq("production_id", productionId).eq("kind", "shoot_day").neq("status", "cancelled"),
    supabase.from("locations").select("name, address").eq("production_id", productionId).eq("status", "confirmed"),
  ]);
  if (!p) return null;
  const recommended = recommendTemplate({ crew: crew ?? false, role });
  const values: Values = {
    recipient_name: signerName,
    production_title: p.title as string,
    role,
    department: department || (crew === false ? "Cast" : ""),
    shoot_dates: shootDatesFrom((days ?? []) as never[]),
    locations: (locs ?? []).map((l) => [l.name, l.address].filter(Boolean).join(", ")).join("; "),
    studio_rep_name: me.fullName,
    studio_rep_title: me.isOwner ? "Owner" : "Producer",
  };
  for (const k of Object.keys(values)) if (!values[k]) delete values[k];
  return { productionId, productionTitle: p.title as string, signerName, signerEmail, applicationId, teamId, contactId, crew, role, recommended, values };
}

/** Fields shown on the prepare form for a template, in a sensible order. */
export function formFields(key: string, body?: TemplateBody): string[] {
  const b = body ?? (templateByKey(key) ? libraryBody(templateByKey(key)!) : null);
  if (!b) return [];
  const used = new Set(fieldsOf(b));
  used.add("studio_rep_name"); used.add("studio_rep_title");
  const order = ["recipient_name", "guardian_name", "minor_birthdate", "production_title", "role", "department", "shoot_dates", "locations",
    "property_address", "property_owner", "access_dates", "materials", "equipment_list", "equipment_value", "return_date", "purpose",
    "responsibilities", "permissions", "compensation", "effective_date", "studio_rep_name", "studio_rep_title"];
  return order.filter((k) => used.has(k));
}
