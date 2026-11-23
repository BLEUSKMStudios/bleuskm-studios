import "server-only";

import { loadSession } from "@/lib/auth/session";
import { MODULES } from "./modules.ts";
import { addDays, studioToday } from "./dates.ts";

export type Deadline = {
  key: string;
  day: string;          // YYYY-MM-DD
  title: string;
  what: string;         // module title
  href: string;
  production_id: string | null;
  overdue: boolean;
};

const AHEAD_DAYS = 45;
const OVERDUE_DAYS = 21;

/**
 * Upcoming and recently overdue dates across every module this person can
 * see. Row Level Security filters each query, so nothing private leaks.
 */
export async function upcomingDeadlines(): Promise<Deadline[]> {
  const { supabase } = await loadSession();
  const today = studioToday();
  const from = addDays(today, -OVERDUE_DAYS);
  const to = addDays(today, AHEAD_DAYS);
  const sources = MODULES.filter((m) => m.dueField && !m.hidden);
  const results = await Promise.all(
    sources.map(async (def) => {
      const cols = ["id", "production_id", def.titleField, def.dueField!, ...(def.doneWhen ? [def.doneWhen.column] : [])];
      let q = supabase.from(def.table).select([...new Set(cols)].join(", ")).gte(def.dueField!, from).lte(def.dueField!, to);
      for (const [k, v] of Object.entries(def.fixed ?? {})) q = q.eq(k, v);
      const { data } = await q.limit(100);
      return ((data ?? []) as unknown as Record<string, unknown>[])
        .filter((r) => !(def.doneWhen && def.doneWhen.values.includes(String(r[def.doneWhen.column]))))
        .map((r): Deadline => {
          const day = String(r[def.dueField!]);
          return {
            key: `${def.key}:${String(r.id)}`, day, title: String(r[def.titleField] ?? def.singular), what: def.title,
            href: `/${def.key}/${String(r.id)}`, production_id: (r.production_id as string | null) ?? null, overdue: day < today,
          };
        })
        // Only overdue items that still need doing: dated events in the past are just history.
        .filter((d) => !d.overdue || def.doneWhen);
    }),
  );
  // Casting deadlines (open calls).
  const { data: calls } = await supabase.from("casting_calls").select("id, production_id, title, deadline, status")
    .eq("status", "open").gte("deadline", `${today}T00:00:00Z`).lte("deadline", `${to}T23:59:59Z`).limit(50);
  const casting: Deadline[] = (calls ?? []).map((c) => ({
    key: `casting:${c.id}`, day: new Date(c.deadline as string).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }),
    title: `${c.title as string} closes`, what: "Casting", href: "/casting", production_id: c.production_id as string, overdue: false,
  }));
  return [...results.flat(), ...casting].sort((a, b) => a.day.localeCompare(b.day)).slice(0, 25);
}

export type Notice = { tone: "warn" | "info" | "bad"; text: string; href?: string };

/** Things that need attention, from records this person can see. */
export async function notices(): Promise<Notice[]> {
  const { supabase } = await loadSession();
  const today = studioToday();
  const [{ count: fresh }, { count: overdue }, { count: blocked }] = await Promise.all([
    supabase.from("casting_applications").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("production_tasks").select("id", { count: "exact", head: true }).lt("due_on", today).neq("status", "done"),
    supabase.from("production_tasks").select("id", { count: "exact", head: true }).eq("status", "blocked"),
  ]);
  const out: Notice[] = [];
  if (fresh) out.push({ tone: "info", text: `${fresh} new casting application${fresh === 1 ? "" : "s"} waiting for review`, href: "/casting" });
  if (overdue) out.push({ tone: "bad", text: `${overdue} task${overdue === 1 ? " is" : "s are"} past due`, href: "/tracking" });
  if (blocked) out.push({ tone: "warn", text: `${blocked} task${blocked === 1 ? " is" : "s are"} blocked`, href: "/tracking" });
  return out;
}
