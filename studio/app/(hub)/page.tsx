import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext } from "@/lib/hub/data";
import { notices, upcomingDeadlines } from "@/lib/hub/dashboard";
import { describeAudit, isSetupNoise, type AuditRow } from "@/lib/hub/audit";
import { integrations, writeBlockReason } from "@/lib/hub/env";
import { formatDay, relativeDay, studioToday } from "@/lib/hub/dates";
import { STAGE_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/hub/labels";
import { PageHead } from "@/components/hub/Page";
import { LocalTime } from "@/components/hub/LocalTime";

export const metadata = { title: "Dashboard · BLEUSKM Studio OS" };

export default async function Dashboard() {
  const { me, productions } = await hubContext();
  const active = productions.filter((p) => p.status !== "archived");
  const today = studioToday();
  const [deadlines, alerts] = await Promise.all([upcomingDeadlines(), notices()]);
  const titleOf = (id: string | null) => (id ? productions.find((p) => p.id === id)?.title ?? "" : "Studio-wide");

  // Owner extras: setup gaps and the latest changes across the studio.
  let activity: { id: number; at: string; text: string }[] = [];
  if (me.isOwner) {
    for (const i of integrations()) {
      if (!i.configured) alerts.push({ tone: "warn", text: `${i.name} isn't connected yet (missing ${i.missing.join(", ")}).`, href: "/administration" });
    }
    const { supabase } = await loadSession();
    const [{ data: log }, { data: people }] = await Promise.all([
      supabase.from("audit_log").select("id, at, actor_id, action, table_name, production_id, old_row, new_row").order("at", { ascending: false }).limit(40),
      supabase.from("profiles").select("id, full_name"),
    ]);
    const names = {
      people: new Map((people ?? []).map((p) => [p.id as string, p.full_name as string])),
      productions: new Map(productions.map((p) => [p.id, p.title])),
    };
    activity = ((log ?? []) as AuditRow[]).filter((r) => !isSetupNoise(r)).slice(0, 10).map((r) => ({
      id: r.id, at: r.at, text: `${r.actor_id ? names.people.get(r.actor_id) ?? "Someone" : "System"}: ${describeAudit(r, names)}`,
    }));
  }
  const ro = writeBlockReason();
  if (ro) alerts.push({ tone: "info", text: ro });

  return (
    <>
      <PageHead title={`Welcome, ${me.fullName.split(" ")[0]}`} lead={`Studio overview · ${formatDay(today)}`}>
        {me.isOwner && <Link className="btn btn-inline" href="/productions/new">New production</Link>}
      </PageHead>

      <div className="stats">
        <div className="stat"><span className="stat-n">{active.length}</span><span className="stat-l">Active productions</span></div>
        <div className="stat"><span className="stat-n">{deadlines.filter((d) => !d.overdue).length}</span><span className="stat-l">Dates in the next 45 days</span></div>
        <div className="stat"><span className="stat-n">{deadlines.filter((d) => d.overdue).length}</span><span className="stat-l">Overdue</span></div>
        <div className="stat"><span className="stat-n">{alerts.length}</span><span className="stat-l">Notifications</span></div>
      </div>

      <section className="panel" id="productions" aria-labelledby="h-productions">
        <div className="panel-head"><h2 id="h-productions">Active productions</h2><Link className="link small" href="/productions">All projects</Link></div>
        {active.length === 0 ? (
          <div className="empty-state">
            <h3>No productions yet</h3>
            <p className="small">{me.isOwner ? <Link className="link" href="/productions/new">Create the first production</Link> : "You haven't been given access to a production yet. The studio owner can add you."}</p>
          </div>
        ) : (
          <div className="cards">
            {active.map((p) => (
              <Link key={p.id} className="card prod-card" href={`/productions/${p.slug}`}>
                <span className="eyebrow">{TYPE_LABEL[p.type]}</span>
                <h3>{p.title}</h3>
                <p className="small">{STAGE_LABEL[p.current_stage]}</p>
                <span className={`tag tag-${p.status}`}>{STATUS_LABEL[p.status]}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="split">
        <section className="panel" id="deadlines" aria-labelledby="h-deadlines">
          <h2 id="h-deadlines">Upcoming deadlines</h2>
          {deadlines.length === 0 ? (
            <div className="empty-state"><p className="small">Nothing due in the next 45 days.</p></div>
          ) : (
            <ul className="timeline">
              {deadlines.map((d) => (
                <li key={d.key} className={d.overdue ? "overdue" : undefined}>
                  <span className="tl-day"><strong>{relativeDay(d.day, today)}</strong><span className="small">{formatDay(d.day)}</span></span>
                  <span className="tl-body"><Link href={d.href}>{d.title}</Link><span className="small">{d.what} · {titleOf(d.production_id)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" id="notifications" aria-labelledby="h-notifications">
          <h2 id="h-notifications">Notifications</h2>
          {alerts.length === 0 ? (
            <div className="empty-state"><p className="small">You're all caught up.</p></div>
          ) : (
            <ul className="notices">
              {alerts.map((a, i) => (
                <li key={i} className={`notice tone-${a.tone}`}>{a.href ? <Link href={a.href}>{a.text}</Link> : a.text}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {me.isOwner && (
        <section className="panel" id="activity" aria-labelledby="h-activity">
          <div className="panel-head"><h2 id="h-activity">Recent activity</h2><Link className="link small" href="/settings/audit">Full history</Link></div>
          {activity.length === 0 ? (
            <div className="empty-state"><p className="small">No changes yet.</p></div>
          ) : (
            <ul className="activity">
              {activity.map((a) => <li key={a.id}><span>{a.text}</span><span className="small"><LocalTime iso={a.at} /></span></li>)}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
