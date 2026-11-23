import "server-only";

import { loadSession } from "@/lib/auth/session";
import { dbCheck, productionBySlug } from "./data.ts";
import type { AppStatus, CallStatus, MaterialKind, RoleStatus, SessionKind, SessionStatus } from "./casting-core.ts";

export type CastingCall = {
  id: string; production_id: string; public_slug: string; title: string; summary: string | null;
  description: string | null; requirements: string | null; instructions: string | null;
  location: string | null; compensation: string | null; status: CallStatus; early_access_codes: string[];
  opens_at: string | null; deadline: string | null; created_at: string;
};
export type CastingRole = {
  id: string; call_id: string; production_id: string; name: string; role_type: string | null;
  summary: string | null; description: string | null; requirements: string | null;
  age_min: number | null; age_max: number | null; deadline: string | null; status: RoleStatus; sort: number;
};
export type Application = {
  id: string; production_id: string; call_id: string; role_id: string; full_name: string; email: string;
  phone: string | null; age: number | null; location: string | null; pronouns: string | null;
  about: string | null; availability: string | null; source: string; access_code: string | null; status: AppStatus;
  rating: number | null; status_changed_at: string; submitted_at: string;
};
export type Material = {
  id: string; application_id: string; kind: MaterialKind; storage_path: string | null; url: string | null;
  file_name: string | null; mime_type: string | null; size_bytes: number | null; label: string | null; created_at: string;
};
export type Note = { id: string; application_id: string; author_id: string | null; body: string; created_at: string };
export type Session = {
  id: string; application_id: string; kind: SessionKind; starts_at: string | null; location: string | null;
  meeting_link: string | null; status: SessionStatus; notes: string | null; created_at: string;
};
export type Template = {
  id: string; production_id: string; key: string; name: string; subject: string; body: string;
  sets_status: AppStatus | null; sort: number;
};
export type Message = {
  id: string; application_id: string; to_email: string; subject: string; body: string;
  status: "sent" | "failed"; error: string | null; sent_by: string | null; sent_at: string;
};

export const CALL_COLS = "id, production_id, public_slug, title, summary, description, requirements, instructions, location, compensation, status, opens_at, deadline, early_access_codes, created_at";
export const ROLE_COLS = "id, call_id, production_id, name, role_type, summary, description, requirements, age_min, age_max, deadline, status, sort";
// Never "*": the upload token column is not readable by hub users.
export const APP_COLS = "id, production_id, call_id, role_id, full_name, email, phone, age, location, pronouns, about, availability, source, access_code, status, rating, status_changed_at, submitted_at";
export const MATERIAL_COLS = "id, application_id, kind, storage_path, url, file_name, mime_type, size_bytes, label, created_at";
export const SESSION_COLS = "id, application_id, kind, starts_at, location, meeting_link, status, notes, created_at";
export const TEMPLATE_COLS = "id, production_id, key, name, subject, body, sets_status, sort";
export const MESSAGE_COLS = "id, application_id, to_email, subject, body, status, error, sent_by, sent_at";

export const BUCKET = "casting-materials";

/** Calls and roles of one production (Row Level Security decides what comes back). */
export async function callsAndRoles(productionId: string) {
  const { supabase } = await loadSession();
  const [{ data: calls }, { data: roles }] = await Promise.all([
    supabase.from("casting_calls").select(CALL_COLS).eq("production_id", productionId).order("created_at"),
    supabase.from("casting_roles").select(ROLE_COLS).eq("production_id", productionId).order("sort").order("name"),
  ]);
  return { calls: (calls ?? []) as CastingCall[], roles: (roles ?? []) as CastingRole[] };
}

export async function templatesFor(productionId: string): Promise<Template[]> {
  const { supabase } = await loadSession();
  const { data } = await supabase.from("casting_templates").select(TEMPLATE_COLS).eq("production_id", productionId).order("sort").order("name");
  return (data ?? []) as Template[];
}

/** Display names of hub users (the owner can read all; others see only themselves). */
export async function peopleNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const { supabase } = await loadSession();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  return new Map((data ?? []).map((r) => [r.id as string, r.full_name as string]));
}

/** The production by address plus the signed-in person's Casting access on it (asked of the database). */
export async function castingAccess(slug: string) {
  const p = await productionBySlug(slug);
  if (!p) return { p: null, canView: false, canEdit: false } as const;
  const [canView, canEdit] = await Promise.all([dbCheck(p.id, "casting", "view"), dbCheck(p.id, "casting", "edit")]);
  return { p, canView, canEdit } as const;
}

export type CallKind = "cast" | "crew";

/**
 * Casting data across every production this person can see (Row Level
 * Security filters each query), for the Applications, Casting and Crew
 * workspaces. A call is a crew call when its website key ends in "-crew".
 */
export async function castingOverview() {
  const { supabase } = await loadSession();
  const [calls, roles, apps, sessions, messages, templates] = await Promise.all([
    supabase.from("casting_calls").select(CALL_COLS).order("created_at").limit(500),
    supabase.from("casting_roles").select(ROLE_COLS).order("sort").order("name").limit(2000),
    supabase.from("casting_applications").select(APP_COLS).order("submitted_at", { ascending: false }).limit(5000),
    supabase.from("casting_sessions").select(`${SESSION_COLS}, production_id`).order("starts_at", { ascending: true, nullsFirst: false }).limit(2000),
    supabase.from("casting_messages").select(`${MESSAGE_COLS}, production_id`).order("sent_at", { ascending: false }).limit(200),
    supabase.from("casting_templates").select(TEMPLATE_COLS).order("sort").limit(500),
  ]);
  const failed = [calls, roles, apps].some((r) => r.error);
  const c = (calls.data ?? []) as CastingCall[];
  const kindOfCall = new Map(c.map((x) => [x.id, (/-crew$/.test(x.public_slug) ? "crew" : "cast") as CallKind]));
  return {
    failed,
    calls: c,
    roles: (roles.data ?? []) as CastingRole[],
    apps: (apps.data ?? []) as Application[],
    sessions: (sessions.data ?? []) as (Session & { production_id: string })[],
    messages: (messages.data ?? []) as (Message & { production_id: string })[],
    templates: (templates.data ?? []) as Template[],
    kindOfCall,
  };
}
