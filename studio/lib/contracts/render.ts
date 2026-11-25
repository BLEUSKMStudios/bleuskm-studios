// Turns a master template and the autofilled values into the exact agreement
// a signer sees. Pure code (unit-tested).
//
// The rendered agreement is serialised to one canonical JSON string. That
// string is what gets frozen, hashed (SHA-256), shown on the signing page and
// printed in the signed PDF, so all three are provably the same wording.

import { createHash } from "node:crypto";
import { FIELDS, SIGN_NOTE, UNKNOWN, type Clause, type TemplateDef } from "./library.ts";

/** What a template stores in the database (contract_templates.body). */
export type TemplateBody = Pick<TemplateDef, "title" | "docLabel" | "signerLabel" | "party" | "required" | "clauses" | "review">;

export type Values = Record<string, string>;

export type Rendered = {
  v: 1;
  agreementId: string;
  template: { key: string; version: number; name: string };
  title: string;
  docLabel: string;
  signerLabel: string;
  production: string;
  signer: { name: string; email: string };
  studio: { name: string; title: string };
  party: { label: string; value: string }[];
  clauses: { n: number; title: string; text: string }[];
  signNote: string;
  /** Fields that had no value and were stated as to be confirmed. */
  unconfirmed: string[];
};

/** What an empty optional field says in the agreement (never a made-up value). */
const DEFAULTS: Record<string, string> = {
  compensation: "None. This is a voluntary, unpaid engagement",
  effective_date: "the date the last party signs this Agreement",
  permissions: "None",
  responsibilities: "the customary duties of the position, as reasonably directed by Production",
  purpose: "evaluating and taking part in the Film",
  studio_rep_name: "an authorized representative of BLEUSKM Studios",
  studio_rep_title: "Authorized Representative",
};
/** Shorter wording for the party bar at the top of the agreement. */
const SHORT_UNKNOWN = "To be confirmed";

const MAX = 5000;

/** Cleans one value: plain text, no control characters, sensible length. */
export function cleanValue(v: unknown, max = MAX): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

export function cleanValues(raw: Record<string, unknown>, allowed: readonly string[]): Values {
  const out: Values = {};
  for (const k of allowed) {
    const v = cleanValue(raw[k], FIELDS[k]?.long ? MAX : 500);
    if (v) out[k] = v;
  }
  return out;
}

const FIELD = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function fieldsOf(body: Pick<TemplateBody, "clauses" | "party" | "required">): string[] {
  const out = new Set<string>(body.required);
  for (const p of body.party) out.add(p.field);
  for (const c of body.clauses) for (const m of c.text.matchAll(FIELD)) out.add(m[1]);
  return [...out];
}

/** Required fields that are still empty (the agreement can't be sent yet). */
export function missingRequired(body: Pick<TemplateBody, "required">, values: Values): string[] {
  return body.required.filter((k) => !values[k]?.trim());
}

function fill(text: string, values: Values, unconfirmed: Set<string>): string {
  return text.replace(FIELD, (_, k: string) => {
    const v = values[k]?.trim();
    if (v) return v;
    if (DEFAULTS[k]) return DEFAULTS[k];
    unconfirmed.add(k);
    return UNKNOWN;
  });
}

export function renderAgreement(o: {
  id: string;
  template: { key: string; version: number; name: string; body: TemplateBody };
  values: Values;
  signer: { name: string; email: string };
}): Rendered {
  const values: Values = { ...o.values, recipient_name: o.values.recipient_name || o.signer.name };
  const unconfirmed = new Set<string>();
  const b = o.template.body;
  const party = b.party.map((p) => {
    const v = values[p.field]?.trim();
    if (!v && !DEFAULTS[p.field]) unconfirmed.add(p.field);
    return { label: p.label, value: v || (p.field === "effective_date" ? "On signing" : DEFAULTS[p.field] ? DEFAULTS[p.field] : SHORT_UNKNOWN) };
  });
  const clauses = b.clauses.map((c: Clause, i) => ({ n: i + 1, title: c.title, text: fill(c.text, values, unconfirmed) }));
  return {
    v: 1,
    agreementId: o.id,
    template: { key: o.template.key, version: o.template.version, name: o.template.name },
    title: b.title,
    docLabel: b.docLabel,
    signerLabel: b.signerLabel,
    production: values.production_title ?? "",
    signer: { name: o.signer.name, email: o.signer.email },
    studio: { name: values.studio_rep_name || DEFAULTS.studio_rep_name, title: values.studio_rep_title || DEFAULTS.studio_rep_title },
    party,
    clauses,
    signNote: SIGN_NOTE,
    unconfirmed: [...unconfirmed].filter((k) => k !== "recipient_name"),
  };
}

/** Deterministic JSON: object keys sorted, so the same agreement always hashes the same. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

export function sha256(s: string | Uint8Array): string {
  return createHash("sha256").update(s).digest("hex");
}

export function freeze(r: Rendered): { text: string; hash: string } {
  const text = canonical(r);
  return { text, hash: sha256(text) };
}

/** Reads frozen wording back, refusing it if it doesn't match its hash. */
export function thaw(text: string | null | undefined, hash: string | null | undefined): Rendered | null {
  if (!text || !hash || sha256(text) !== hash) return null;
  try {
    const r = JSON.parse(text) as Rendered;
    return r && r.v === 1 && Array.isArray(r.clauses) ? r : null;
  } catch {
    return null;
  }
}

/** Plain-text version (for search, email copies and accessibility). */
export function agreementText(r: Rendered): string {
  const lines = [`BLEUSKM STUDIOS · ${r.docLabel.toUpperCase()}`, r.title, ""];
  for (const p of r.party) lines.push(`${p.label}: ${p.value}`);
  lines.push("");
  for (const c of r.clauses) lines.push(`${c.n}. ${c.title.toUpperCase()}`, c.text, "");
  lines.push(r.signNote);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Which template fits a person
// ---------------------------------------------------------------------------
const KEY_CREW = /\b(director of photography|dp|cinematographer|gaffer|key grip|sound mixer|production designer|art director|costume designer|wardrobe (head|supervisor)|hair|makeup|key|head|supervisor|editor|1st ad|first assistant director|line producer|composer)\b/i;
const PRODUCER = /\b(producer|co-producer|coordinator|production manager|upm|pm)\b/i;
const BACKGROUND = /\b(background|extra|extras|crowd|featured extra|stand-?in)\b/i;

export function recommendTemplate(o: { crew: boolean; role?: string | null; minor?: boolean }): string {
  const role = o.role ?? "";
  if (o.minor) return "minor_performer";
  if (o.crew) {
    if (PRODUCER.test(role)) return "producer";
    if (KEY_CREW.test(role)) return "crew_key";
    return "crew_general";
  }
  if (BACKGROUND.test(role)) return "background_performer";
  return "actor_principal";
}

/** The email identity an agreement is sent from. */
export function identityForTemplate(audience: string, templateIdentity: string, crew: boolean | null): string {
  if (audience === "cast") return "casting";
  if (audience === "crew") return "crew";
  if (crew === true) return "crew";
  if (crew === false) return "casting";
  return templateIdentity;
}

// ---------------------------------------------------------------------------
// Template editing format (what the owner edits as text)
// ---------------------------------------------------------------------------
// Each clause is "## Title" followed by its text. A line starting with
// "> Attorney review:" after the text becomes the clause's review flag.
export function clausesToText(clauses: Clause[]): string {
  return clauses.map((c) => `## ${c.title}\n${c.text}${c.review ? `\n> Attorney review: ${c.review}` : ""}`).join("\n\n");
}

export function textToClauses(text: string): { clauses: Clause[]; error?: string } {
  const blocks = cleanValue(text, 200000).split(/^##\s+/m).map((b) => b.trim()).filter(Boolean);
  const clauses: Clause[] = [];
  for (const b of blocks) {
    const [titleLine, ...rest] = b.split("\n");
    const title = titleLine.trim().slice(0, 120);
    const review: string[] = [];
    const body: string[] = [];
    for (const l of rest) {
      const m = /^>\s*Attorney review:\s*(.*)$/i.exec(l.trim());
      if (m) review.push(m[1]);
      else body.push(l);
    }
    const t = body.join("\n").trim();
    if (!title || !t) return { clauses: [], error: `Each section needs a title line ("## Title") and text. Check "${title || b.slice(0, 40)}".` };
    const bad = [...t.matchAll(FIELD)].map((m) => m[1]).find((k) => !FIELDS[k]);
    if (bad) return { clauses: [], error: `"{{${bad}}}" in "${title}" isn't a field Studio OS can fill.` };
    clauses.push({ title, text: t, ...(review.length ? { review: review.join(" ") } : {}) });
  }
  if (!clauses.length) return { clauses: [], error: "The agreement needs at least one section." };
  if (clauses.length > 60) return { clauses: [], error: "That's more than 60 sections." };
  return { clauses };
}

export function libraryBody(t: TemplateDef): TemplateBody {
  return { title: t.title, docLabel: t.docLabel, signerLabel: t.signerLabel, party: t.party, required: t.required, clauses: t.clauses, review: t.review };
}

export { FIELDS, UNKNOWN };

// ---------------------------------------------------------------------------
// What the signer agrees to on the signing page (recorded word for word)
// ---------------------------------------------------------------------------
export const CONSENT_TEXT =
  "I agree to use electronic records and signatures for this agreement with BLEUSKM Studios. I understand that my electronic signature is legally binding, the same as a handwritten signature; that I can ask for a paper copy, or withdraw this consent for future documents, by emailing studio@bleuskm.com; and that I need a device that can open PDF files to keep my signed copy.";
export const AGREE_TEXT = "I have read this agreement in full, I am the person named in it, and I agree to its terms.";

/** Loose comparison of a typed name with the name on the agreement. */
export function sameName(a: string, b: string): boolean {
  const n = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return !!n(a) && n(a) === n(b);
}

export function maskEmail(e: string): string {
  const [u, d] = e.split("@");
  if (!d) return e;
  return `${u.slice(0, Math.min(2, u.length))}${"•".repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}`;
}
