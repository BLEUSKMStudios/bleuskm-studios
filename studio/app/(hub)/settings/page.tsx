import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext } from "@/lib/hub/data";
import { commsSendBlockReason, integrations, isPreview, writeBlockReason } from "@/lib/hub/env";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { SetupPending } from "@/components/hub/ModuleView";
import { isMissingTable } from "@/lib/hub/modules";
import { LocalTime } from "@/components/hub/LocalTime";

export const metadata = { title: "Settings & Administration · BLEUSKM Studio OS" };

const CARDS = [
  { href: "/settings/users", title: "User Access", text: "Invite people, deactivate or reactivate them, send password resets, and set No/View/Edit for each section and production." },
  { href: "/settings/productions", title: "Productions & lifecycle", text: "Details, lifecycle stages, the sections each production uses, and team role labels." },
  { href: "/settings/audit", title: "Audit log", text: "Every change to people, access, productions and records, with who made it and when." },
  { href: "/status", title: "System status", text: "Database connection, security rules and migrations on this environment." },
];

// Owner only: people and access, productions, connections, data imports,
// audit, system status and the legacy systems being retired. Values of
// environment variables and credentials are never shown, only their names.
export default async function SettingsHome() {
  const { me } = await hubContext();
  if (!me.isOwner) return <NoAccess what="Settings & Administration" />;
  const { supabase } = await loadSession();
  const { data: runs, error: runsError } = await supabase.from("migration_runs").select("id, name, mode, status, started_at, finished_at, summary").order("started_at", { ascending: false }).limit(20);
  const list = integrations();
  const ro = writeBlockReason();
  const send = commsSendBlockReason();

  return (
    <>
      <PageHead title="Settings & Administration" lead="Only you can see this area." />
      <div className="cards">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="card">
            <h2>{c.title}</h2>
            <p className="small">{c.text}</p>
          </Link>
        ))}
      </div>

      <section className="panel">
        <h2>This deployment</h2>
        <dl className="facts">
          <div className="fact"><dt>Environment</dt><dd>{isPreview() ? "Preview" : process.env.VERCEL_ENV === "production" ? "Production" : "Local"}</dd></div>
          <div className="fact"><dt>Saving</dt><dd>{ro ? <span className="tag tone-warn">Read-only</span> : <span className="tag tone-good">On</span>} {ro && <span className="small block">{ro}</span>}</dd></div>
          <div className="fact"><dt>Email from Communications</dt><dd>{send ? <span className="tag tone-muted">Off</span> : <span className="tag tone-good">On</span>} {send && <span className="small block">{send}</span>}</dd></div>
        </dl>
      </section>

      <section className="panel">
        <h2>Integrations and connections</h2>
        <ul className="plain">
          {list.map((i) => (
            <li key={i.key} className="integration">
              <span><strong>{i.name}</strong> <span className="small">· {i.purpose}</span></span>
              {i.configured ? <span className="tag tone-good">Connected</span> : <span className="tag tone-warn">Missing {i.missing.join(", ")}</span>}
            </li>
          ))}
        </ul>
        <p className="small">Secrets are set in Vercel (hub project → Settings → Environment Variables), never in Studio OS or the code. Values are never shown here.</p>
      </section>

      <section className="panel">
        <h2>Data imports and migration history</h2>
        {runsError && isMissingTable(runsError.code) ? <SetupPending what="Migration history" /> : (runs ?? []).length === 0 ? (
          <div className="empty-state">
            <h3>No imports have run yet</h3>
            <p className="small">The Final Hand import runs from GitHub Actions (“Studio OS database (staging)”, run manually with final_hand_import) once its Airtable token is added and you approve it. A dry run comes first and changes nothing.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Import</th><th>Mode</th><th>Status</th><th>Started</th><th>Records</th></tr></thead>
              <tbody>
                {(runs ?? []).map((r) => {
                  const s = (r.summary ?? {}) as { totals?: Record<string, number> };
                  const total = Object.values(s.totals ?? {}).reduce((a, b) => a + b, 0);
                  return (
                    <tr key={r.id}>
                      <th scope="row">{r.name}</th>
                      <td>{r.mode === "dry_run" ? "Dry run" : r.mode === "apply" ? "Import" : "Validation"}</td>
                      <td><span className={`tag tone-${r.status === "succeeded" ? "good" : r.status === "failed" ? "bad" : "warn"}`}>{r.status}</span></td>
                      <td className="nowrap"><LocalTime iso={r.started_at as string} /></td>
                      <td>{total || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Legacy systems</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>System</th><th>Status</th><th>What happens next</th></tr></thead>
            <tbody>
              <tr><th scope="row">Final Hand portal (bleuskm.com/portal)</th><td><span className="tag tone-warn">Running until validated</span></td><td>Retired after the import is validated: set <code>PORTAL_RETIRED=1</code> on the website project. Airtable records are kept.</td></tr>
              <tr><th scope="row">Vix dashboard (bleuskm.com/dashboard)</th><td><span className="tag tone-good">Removed</span></td><td>The page and its AI, voice and Stripe connections were removed. The address now goes to Studio OS.</td></tr>
              <tr><th scope="row">Netlify functions</th><td><span className="tag tone-good">Removed from the code</span></td><td>Turn off the old Netlify site in Netlify (owner action).</td></tr>
            </tbody>
          </table>
        </div>
      </section>

    </>
  );
}
