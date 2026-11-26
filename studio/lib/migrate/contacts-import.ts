// Contacts import: Brevo contacts and the website's Airtable sign-up tables
// (Newsletter, Film Notifications, Project Inquiries) -> Studio OS contacts.
//
// Pure code. Every record becomes one call to public.studio_intake with
// origin "import", keyed by its source record, so re-running never duplicates
// and never sends anything (imports never trigger confirmations). Consent is
// carried over with its original date. Brevo's blocklist (unsubscribed or
// bounced) is applied last and always wins. Casting and crew applications are
// imported by the Final Hand import (they become contacts automatically).

import { lit, type AirtableRecord } from "./final-hand.ts";

export const SIGNUP_TABLES = {
  newsletter: { id: "tblSMb3y7vrvjbONx", name: "Newsletter" },
  notify: { id: "tblcSHay5dfYcbDKC", name: "Film Notifications" },
  inquiries: { id: "tblwfk7tmoFhGIia5", name: "Project Inquiries" },
} as const;
export type SignupKey = keyof typeof SIGNUP_TABLES;

export type BrevoContact = {
  id: number;
  email?: string;
  emailBlacklisted?: boolean;
  createdAt?: string;
  listIds?: number[];
  attributes?: Record<string, unknown>;
};

export const NEWSLETTER_LIST = 2;

const str = (v: unknown, max = 500): string | null => {
  if (v == null) return null;
  const s = (Array.isArray(v) ? v.join(", ") : String(v)).trim().slice(0, max);
  return s || null;
};
const email = (v: unknown) => (str(v, 254) ?? "").toLowerCase();
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

type Intake = Record<string, unknown>;

function call(p: Intake): string {
  return `select public.studio_intake(${lit(JSON.stringify(p))}::jsonb);`;
}

export function airtableIntake(table: SignupKey, r: AirtableRecord): Intake | null {
  const f = r.fields;
  const e = email(f.Email);
  if (!EMAIL_RE.test(e)) return null;
  const base = { submission_key: `airtable:${SIGNUP_TABLES[table].id}:${r.id}`, origin: "import", received_at: r.createdTime ?? null, email: e, name: str(f.Name, 200) };
  if (table === "newsletter") {
    return { ...base, kind: "newsletter", consent: { source: "bleuskm.com newsletter form (imported from Airtable)", text: "Signed up for the BLEUSKM Studios newsletter on bleuskm.com." } };
  }
  if (table === "notify") {
    const film = str(f.Film, 200);
    return { ...base, kind: "film_notify", film, role: str(f["Role Interested In"], 200),
      payload: { Type: str(f.Type, 100), "Role Interested In": str(f["Role Interested In"], 200) },
      consent: { film_updates: true, source: "bleuskm.com film updates form (imported from Airtable)", text: film ? `Asked for updates on ${film} on bleuskm.com.` : null } };
  }
  return { ...base, kind: "client_inquiry", phone: str(f["Phone number"], 40),
    payload: { "Project Type": str(f["Project Type"], 200), Budget: str(f.Budget, 200), Concept: str(f.Concept, 5000), Timeline: str(f.Timeline, 500) } };
}

export function brevoIntake(c: BrevoContact): Intake | null {
  const e = email(c.email);
  if (!EMAIL_RE.test(e)) return null;
  const a = c.attributes ?? {};
  const name = [str(a.FIRSTNAME, 100), str(a.LASTNAME, 100)].filter(Boolean).join(" ") || null;
  const film = str(a.FILM, 200);
  const onNewsletter = (c.listIds ?? []).includes(NEWSLETTER_LIST);
  return {
    submission_key: `brevo:contact:${c.id}`,
    origin: "import",
    received_at: c.createdAt ?? null,
    kind: onNewsletter ? "newsletter" : "other",
    email: e,
    name,
    phone: str(a.SMS ?? a.PHONE, 40),
    film: onNewsletter ? film : null,
    payload: { brevo_lists: (c.listIds ?? []).join(","), ROLE: str(a.ROLE, 200), CREW_ROLE: str(a.CREW_ROLE, 200) },
    consent: onNewsletter
      ? { newsletter: true, film_updates: !!film, source: `Brevo list ${NEWSLETTER_LIST} (imported)`, text: "On the BLEUSKM Studios newsletter list in Brevo when Studio OS was set up." }
      : {},
  };
}

export type ContactsPlan = { sql: string; counts: Record<string, number>; skipped: Record<string, number> };

export function buildContactsPlan(sources: { brevo: BrevoContact[]; airtable: Record<SignupKey, AirtableRecord[]> }): ContactsPlan {
  const lines: string[] = [];
  const counts: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };

  // Oldest first, so later sign-ups and unsubscribes win.
  const airtable: { t: SignupKey; r: AirtableRecord }[] = [];
  for (const t of Object.keys(SIGNUP_TABLES) as SignupKey[]) for (const r of sources.airtable[t] ?? []) airtable.push({ t, r });
  airtable.sort((x, y) => (x.r.createdTime ?? "").localeCompare(y.r.createdTime ?? ""));
  for (const { t, r } of airtable) {
    const p = airtableIntake(t, r);
    if (!p) { bump(skipped, `airtable ${SIGNUP_TABLES[t].name}: no valid email`); continue; }
    lines.push(call(p));
    bump(counts, `airtable ${SIGNUP_TABLES[t].name}`);
  }
  const brevo = [...sources.brevo].sort((x, y) => (x.createdAt ?? "").localeCompare(y.createdAt ?? ""));
  const blocked: string[] = [];
  for (const c of brevo) {
    const p = brevoIntake(c);
    if (!p) { bump(skipped, "brevo: no valid email"); continue; }
    lines.push(call(p));
    bump(counts, p.kind === "newsletter" ? "brevo newsletter subscribers" : "brevo other contacts");
    if (c.emailBlacklisted) blocked.push(p.email as string);
  }
  if (blocked.length) {
    // Blocklisted in Brevo = unsubscribed from every marketing list.
    lines.push(`update public.contact_subscriptions s set status = 'unsubscribed', unsubscribed_at = now(), unsubscribe_reason = 'Blocklisted in Brevo (imported)'
from public.contacts c, public.audiences a
where c.id = s.contact_id and a.id = s.audience_id and a.marketing and s.status <> 'unsubscribed'
  and c.email in (${blocked.map((e) => lit(e)).join(", ")});`);
    counts["brevo blocklisted (unsubscribed from marketing)"] = blocked.length;
  }
  return { sql: lines.join("\n"), counts, skipped };
}

/** Validation queries: fail the transaction if the import left duplicates. */
export function contactsValidation(): string {
  return `do $$
begin
  if exists (select email from public.contacts where email is not null and merged_into is null group by email having count(*) > 1) then
    raise exception 'duplicate contacts after import';
  end if;
  if exists (select 1 from public.contact_subscriptions s join public.audiences a on a.id = s.audience_id
             where a.marketing and s.status = 'subscribed' and coalesce(s.consent_source, '') = '') then
    raise exception 'marketing subscription without consent after import';
  end if;
end $$;`;
}
