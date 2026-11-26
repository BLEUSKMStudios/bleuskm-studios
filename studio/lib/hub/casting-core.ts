// Casting: fixed values, labels and small pure helpers (no server or database code,
// so they can be unit tested and used in client components).

export const CALL_STATUSES = ["draft", "open", "closed"] as const;
export const ROLE_STATUSES = ["open", "closed", "cast"] as const;
// The pipeline order: New → Reviewing → Shortlisted → Self-tape invited →
// Self-tape received → Callback → Audition → Selected → Offered → Cast,
// or Declined / Withdrawn / On hold at any point.
export const APP_STATUSES = [
  "submitted", "reviewing", "shortlisted", "selftape_invited", "selftape_received", "callback", "audition",
  "selected", "on_hold", "offered", "cast", "not_selected", "withdrawn",
] as const;
export const MATERIAL_KINDS = ["headshot", "resume", "portfolio", "reel", "self_tape", "other"] as const;
export const SESSION_KINDS = ["audition", "callback", "chemistry_read", "self_tape"] as const;
export const SESSION_STATUSES = ["scheduled", "completed", "no_show", "cancelled"] as const;

export type CallStatus = (typeof CALL_STATUSES)[number];
export type RoleStatus = (typeof ROLE_STATUSES)[number];
export type AppStatus = (typeof APP_STATUSES)[number];
export type MaterialKind = (typeof MATERIAL_KINDS)[number];
export type SessionKind = (typeof SESSION_KINDS)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  draft: "Draft (not public)",
  open: "Open for submissions",
  closed: "Closed",
};
export const ROLE_STATUS_LABEL: Record<RoleStatus, string> = { open: "Open", closed: "Closed (hidden)", cast: "Cast" };
export const APP_STATUS_LABEL: Record<AppStatus, string> = {
  submitted: "New",
  reviewing: "Reviewing",
  shortlisted: "Shortlisted",
  selftape_invited: "Self-tape invited",
  selftape_received: "Self-tape received",
  callback: "Callback",
  audition: "Audition",
  selected: "Selected",
  on_hold: "On hold",
  offered: "Offered",
  cast: "Cast",
  not_selected: "Declined",
  withdrawn: "Withdrawn",
};
export const MATERIAL_LABEL: Record<MaterialKind, string> = {
  headshot: "Headshot",
  resume: "Resume",
  portfolio: "Portfolio",
  reel: "Reel",
  self_tape: "Self-tape",
  other: "Additional material",
};
export const SESSION_KIND_LABEL: Record<SessionKind, string> = {
  audition: "Audition",
  callback: "Callback",
  chemistry_read: "Chemistry read",
  self_tape: "Self-tape request",
};
export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  no_show: "No show",
  cancelled: "Cancelled",
};

export function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Times. The studio works in Central time, so dates typed into the hub are
// read as Central time, whatever the server's own time zone is.
// ---------------------------------------------------------------------------
export const STUDIO_TZ = "America/Chicago";

function offsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((asUtc - utcMs) / 60000);
}

/** "2026-11-30T23:59" typed in studio time -> ISO string in UTC. Null for empty or invalid input. */
export function studioLocalToIso(local: string, tz = STUDIO_TZ): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ms = guess - offsetMinutes(guess, tz) * 60000;
  ms = guess - offsetMinutes(ms, tz) * 60000; // settle across daylight-saving changes
  return new Date(ms).toISOString();
}

/** ISO -> value for <input type="datetime-local">, in studio time. */
export function isoToStudioLocal(iso: string | null | undefined, tz = STUDIO_TZ): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms + offsetMinutes(ms, tz) * 60000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Human text in studio time, e.g. "Mon, Nov 30, 2026, 11:59 PM CST". */
export function formatStudioTime(iso: string | null | undefined, tz = STUDIO_TZ): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(ms));
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------
export const TEMPLATE_FIELDS = [
  "first_name", "full_name", "role", "film", "deadline", "session_kind", "session_time", "session_location",
] as const;
export type TemplateVars = Partial<Record<(typeof TEMPLATE_FIELDS)[number], string>>;

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}

/** Fills {{field}} placeholders. Unknown or empty fields become empty text. */
export function fillTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => (vars as Record<string, string | undefined>)[k] ?? "");
}

/** Placeholders a template uses that have no value for this person. */
export function missingFields(text: string, vars: TemplateVars): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) {
    if (!(vars as Record<string, string | undefined>)[m[1]]) out.add(m[1]);
  }
  return [...out];
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * A crew call is one whose public address ends in "-crew" (e.g. love-me-like-this-crew).
 * Emails to its applicants come from crew@, everything else from casting@.
 */
export function isCrewCall(publicSlug: string | null | undefined): boolean {
  return /-crew$/.test(publicSlug ?? "");
}

export const CASTING_FROM = "casting@bleuskm.com";
export const CREW_FROM = "crew@bleuskm.com";

/** The address an applicant's emails are sent from, by their call. */
export function senderEmailFor(publicSlug: string | null | undefined): string {
  return isCrewCall(publicSlug) ? CREW_FROM : CASTING_FROM;
}

/** Plain email text -> simple branded HTML (paragraphs and line breaks only). */
export function emailHtml(body: string, from: string = CASTING_FROM): string {
  const paras = body.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
  return `<!doctype html><html><body style="margin:0;background:#f6f3ee"><div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1a1a1a;background:#ffffff;border-top:4px solid #DAAF37">${paras.join("")}<p style="margin:24px 0 0;font-size:12px;color:#888">BLEUSKM Studios · ${escapeHtml(from)}</p></div></body></html>`;
}

/** Safe web link or null. */
export function cleanUrl(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (s.length > 1000 || !/^https?:\/\/\S+$/i.test(s)) return null;
  return s;
}
