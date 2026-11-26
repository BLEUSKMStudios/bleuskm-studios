// Website intake: what the website's server may send to Studio OS. Pure code
// (unit-tested). Anything not listed here is dropped.

export const INTAKE_KINDS = [
  "casting", "crew", "newsletter", "film_notify", "inquiry", "client_inquiry", "self_tape", "contract", "consent", "other",
] as const;
export type IntakeKind = (typeof INTAKE_KINDS)[number];

export type IntakeInput = {
  kind: IntakeKind;
  submission_key: string;
  email: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  website: string | null;
  film: string | null;
  role: string | null;
  production_slug: string | null;
  payload: Record<string, unknown>;
  consent: { newsletter: boolean; film_updates: boolean; text: string | null; source: string | null };
  confirmation: "none" | "website" | "studio";
};

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

function text(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
  return s || null;
}

/** Validates one submission. Returns the clean input, or an error code. */
export function parseIntake(raw: unknown): { ok: true; input: IntakeInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "bad_body" };
  const r = raw as Record<string, unknown>;
  const kind = String(r.kind ?? "") as IntakeKind;
  if (!INTAKE_KINDS.includes(kind)) return { ok: false, error: "unknown_kind" };
  const key = text(r.submission_key, 200);
  if (!key || key.length < 8 || !/^[\w:.-]+$/.test(key)) return { ok: false, error: "bad_submission_key" };
  const email = (text(r.email, 254) ?? "").toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "invalid_email" };
  const site = text(r.website, 1000);
  const payloadRaw = r.payload && typeof r.payload === "object" && !Array.isArray(r.payload) ? (r.payload as Record<string, unknown>) : {};
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payloadRaw).slice(0, 40)) {
    const key2 = k.slice(0, 80);
    if (typeof v === "boolean" || typeof v === "number") payload[key2] = v;
    else if (v != null) payload[key2] = text(v, 5000);
  }
  const c = r.consent && typeof r.consent === "object" ? (r.consent as Record<string, unknown>) : {};
  const confirmation = r.confirmation === "studio" || r.confirmation === "website" ? r.confirmation : "none";
  const slug = text(r.production_slug, 100);
  return {
    ok: true,
    input: {
      kind,
      submission_key: key,
      email,
      name: text(r.name, 200),
      phone: text(r.phone, 40),
      city: text(r.city, 200),
      website: site && /^https?:\/\//i.test(site) && !/^(javascript|data|vbscript):/i.test(site) ? site : null,
      film: text(r.film, 200),
      role: text(r.role, 200),
      production_slug: slug && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : null,
      payload,
      consent: {
        newsletter: c.newsletter === true,
        film_updates: c.film_updates === true,
        text: text(c.text, 2000),
        source: text(c.source, 200),
      },
      confirmation,
    },
  };
}

/** Constant-time comparison for the shared intake secret. */
export function secretMatches(given: string | null, expected: string | undefined): boolean {
  const e = (expected ?? "").trim();
  if (e.length < 32 || !given) return false;
  const g = given.trim();
  let diff = g.length ^ e.length;
  for (let i = 0; i < e.length; i++) diff |= (g.charCodeAt(i % (g.length || 1)) ?? 0) ^ e.charCodeAt(i);
  return diff === 0;
}
