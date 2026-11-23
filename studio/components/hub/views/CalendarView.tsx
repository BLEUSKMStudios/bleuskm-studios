import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext } from "@/lib/hub/data";
import { isMissingTable, moduleByKey, optionLabel } from "@/lib/hub/modules";
import { formatDay, relativeDay, studioToday, addDays } from "@/lib/hub/dates";
import { SetupPending } from "@/components/hub/ModuleView";
import { ProductionChips, withQuery } from "./ProductionChips";
import type { WorkspaceSearch } from "@/components/hub/WorkspaceView";

type Item = { key: string; day: string; time: string | null; kind: string; title: string; href: string; production_id: string | null; status: string | null };

const HREF = "/scheduling?tab=calendar";

/**
 * The master production calendar: every dated schedule entry (milestones,
 * meetings, deadlines, shoot days) and every call sheet, merged by date.
 * Row Level Security filters both queries.
 */
export async function CalendarView({ search }: { search: WorkspaceSearch & { past?: string } }) {
  const { productions } = await hubContext();
  const { supabase } = await loadSession();
  const today = studioToday();
  const showPast = search.past === "1";
  const from = showPast ? addDays(today, -365) : addDays(today, -7);
  const production = productions.some((p) => p.id === search.production) ? search.production : undefined;

  let ev = supabase.from("schedule_events").select("id, production_id, title, kind, starts_on, ends_on, start_time, status").gte("starts_on", from).order("starts_on").limit(1000);
  let cs = supabase.from("call_sheets").select("id, production_id, title, shoot_date, general_call, status").gte("shoot_date", from).order("shoot_date").limit(500);
  if (production) { ev = ev.eq("production_id", production); cs = cs.eq("production_id", production); }
  const [events, sheets] = await Promise.all([ev, cs]);
  const missing = [events.error, sheets.error].some((e) => e && isMissingTable(e.code));
  const failed = [events.error, sheets.error].some((e) => e && !isMissingTable(e.code));

  const kindField = moduleByKey("scheduling")!.fields.find((f) => f.name === "kind")!;
  const items: Item[] = [
    ...((events.data ?? []) as Record<string, string | null>[]).map((e) => ({
      key: `e${e.id}`, day: e.starts_on!, time: e.start_time, kind: optionLabel(kindField, e.kind), title: e.title ?? "",
      href: e.kind === "shoot_day" ? `/shoot-schedule/${e.id}` : `/scheduling/${e.id}`, production_id: e.production_id, status: e.status,
    })),
    ...((sheets.data ?? []) as Record<string, string | null>[]).map((c) => ({
      key: `c${c.id}`, day: c.shoot_date!, time: c.general_call, kind: "Call sheet", title: c.title ?? "",
      href: `/call-sheets/${c.id}`, production_id: c.production_id, status: c.status,
    })),
  ].sort((a, b) => (a.day === b.day ? (a.time ?? "").localeCompare(b.time ?? "") : a.day.localeCompare(b.day)));

  const months = new Map<string, Item[]>();
  for (const it of items) {
    const m = it.day.slice(0, 7);
    months.set(m, [...(months.get(m) ?? []), it]);
  }
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const titleOf = (id: string | null) => (id ? productions.find((p) => p.id === id)?.title ?? "" : "Studio-wide");

  return (
    <>
      <p className="lead-line">Everything with a date, across the productions open to you. Add entries in the other tabs; they appear here automatically.</p>
      <ProductionChips productions={productions} current={production} href={(p) => withQuery(HREF, { production: p, past: search.past })} />
      <p className="small" style={{ marginTop: -6, marginBottom: 14 }}>
        {showPast
          ? <Link className="link" href={withQuery(HREF, { production, past: undefined })}>Show upcoming only</Link>
          : <Link className="link" href={withQuery(HREF, { production, past: "1" })}>Include the past year</Link>}
      </p>
      <section className="panel">
        {missing ? <SetupPending what="Scheduling" /> : failed ? (
          <p className="msg error" role="alert">The calendar couldn&apos;t be loaded. Refresh to try again.</p>
        ) : items.length === 0 ? (
          <div className="empty-state"><h3>Nothing scheduled</h3><p className="small">Add milestones, meetings, deadlines, shoot days or call sheets in the tabs above.</p></div>
        ) : (
          [...months.entries()].map(([m, list]) => (
            <div key={m} className="cal-month">
              <h3 className="cal-month-title">{monthLabel(m)}</h3>
              <ul className="timeline">
                {list.map((it) => (
                  <li key={it.key} className={it.day < today ? "past" : undefined}>
                    <div className="tl-day"><strong>{formatDay(it.day)}</strong><span className="small">{relativeDay(it.day, today)}{it.time ? ` · ${it.time.slice(0, 5)}` : ""}</span></div>
                    <div className="tl-body">
                      <Link href={it.href}>{it.title}</Link>
                      <span className="small">{it.kind}{productions.length > 1 || !it.production_id ? ` · ${titleOf(it.production_id)}` : ""}{it.status ? ` · ${it.status.replace(/_/g, " ")}` : ""}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </>
  );
}
