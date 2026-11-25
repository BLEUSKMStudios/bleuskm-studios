// Contacts: pure helpers for the list, filters and profile (unit-tested).

export const CONTACT_CATEGORIES = [
  ["cast", "Cast"], ["crew", "Crew"], ["subscriber", "Subscriber"], ["client", "Client"], ["inquiry", "Inquiry"],
  ["vendor", "Vendor"], ["location", "Location"], ["festival", "Festival"], ["press", "Press"], ["other", "Other"],
] as const;
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CONTACT_CATEGORIES);

export function parseTags(raw: string): string[] {
  const out: string[] = [];
  for (const t of raw.split(/[,\n]/)) {
    const tag = t.trim().toLowerCase().replace(/[^a-z0-9 _-]/g, "").replace(/\s+/g, "-").slice(0, 40);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= 50) break;
  }
  return out;
}

export type ContactFilter = { q: string; category: string; tag: string; audience: string };

export function readFilter(sp: Record<string, string | string[] | undefined>): ContactFilter {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v ?? "").trim().slice(0, 100);
  };
  const category = one("category");
  return {
    q: one("q"),
    category: CATEGORY_LABEL[category] ? category : "",
    tag: parseTags(one("tag"))[0] ?? "",
    audience: /^[a-z0-9:-]{1,80}$/.test(one("audience")) ? one("audience") : "",
  };
}

/** A PostgREST "or" filter for a free-text search, with the user's text made safe. */
export function searchOr(q: string): string | null {
  const s = q.replace(/[%_,()*\\"'.:]/g, " ").trim().slice(0, 80);
  if (!s) return null;
  const like = `%${s.replace(/\s+/g, "%")}%`;
  return ["full_name", "email", "phone", "city", "company", "roles"].map((c) => `${c}.ilike.${like}`).join(",");
}

export function filterHref(base: ContactFilter, change: Partial<ContactFilter>): string {
  const f = { ...base, ...change };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/contacts?${s}` : "/contacts";
}

export const ACTIVITY_ICON: Record<string, string> = {
  intake: "Form", application: "Application", email: "Email", note: "Note", subscription: "List", contact: "Contact",
  selftape: "Self-tape", contract: "Contract", document: "Document", onboarding: "Onboarding", crew: "Crew", callsheet: "Call sheet",
};

export function activityLabel(kind: string): string {
  return ACTIVITY_ICON[kind.split(".")[0]] ?? "Update";
}
