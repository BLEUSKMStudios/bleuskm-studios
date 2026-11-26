// Casting call dates for the master calendar. Pure code (unit-tested).
// The dates come straight from the casting call (early-access starts, public
// opening, deadline), so the calendar can never disagree with what the public
// form enforces. Nothing here writes anything.
import { isoToStudioLocal } from "./casting-core.ts";

export type CallDates = {
  id: string; production_id: string; title: string; status: string; public_slug: string;
  opens_at: string | null; deadline: string | null; early_access_starts: Record<string, unknown> | null;
};
export type CalendarItem = {
  key: string; day: string; time: string | null; kind: string; title: string;
  href: string; production_id: string | null; status: string | null;
};

/** One calendar entry per dated moment of a call, in studio (Central) time; from = first day shown. */
export function castingCallItems(calls: readonly CallDates[], href: (c: CallDates) => string, from: string): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const c of calls) {
    const kind = c.public_slug.endsWith("-crew") ? "Crew call" : "Casting call";
    const add = (suffix: string, what: string, iso: unknown) => {
      if (typeof iso !== "string") return;
      const local = isoToStudioLocal(iso);
      if (!local || local.slice(0, 10) < from) return;
      out.push({ key: `k${c.id}-${suffix}`, day: local.slice(0, 10), time: local.slice(11, 16), kind, title: `${c.title}: ${what}`, href: href(c), production_id: c.production_id, status: c.status });
    };
    for (const [code, at] of Object.entries(c.early_access_starts ?? {}).sort(([, a], [, b]) => String(a).localeCompare(String(b)))) {
      add(`ea-${code}`, `early access opens (${code})`, at);
    }
    add("open", "opens to the public", c.opens_at);
    add("deadline", "submissions close", c.deadline);
  }
  return out;
}
