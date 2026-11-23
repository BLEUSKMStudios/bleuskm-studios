import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext } from "@/lib/hub/data";
import { commsSendBlockReason, integrations, isPreview, writeBlockReason } from "@/lib/hub/env";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { LocalTime } from "@/components/hub/LocalTime";

export const metadata = { title: "Administration · BLEUSKM Studio OS" };

// Owner only: connections, data imports and the legacy systems being retired.
export default async function Administration() {
  const { me } = await hubContext();
  if (!me.isOwner) return <NoAccess what="Administration" />;
  const { supabase } = await loadSession();
  const { data: runs } = await supabase.from("migration_runs").select("id, name, mode, status, started_at, finished_at, summary").order("started_at", { ascending: false }).limit(20);
  const list = integrations();
  const ro = writeBlockReason();
  const send = commsSendBlockReason();

  return (
    <>
      <PageHead title="Administration" lead="Connections, data imports and the systems Studio OS replaces." />

      <section className="panel">
        <h2>This deployment</h2>
        <dl className="facts">
          <div className="fact"><dt>Environment</dt><dd>{isPreview() ? "Preview" : process.env.VERCEL_ENV === "production" ? "Production" : "Local"}</dd></div>
          <div className="fact"><dt>Saving</dt><dd>{ro ? <span className="tag tone-warn">Read-only</span> : <span className="tag tone-good">On</span>} {ro && <span className="small block">{ro}</span>}</dd></div>
          <div className="fact"><dt>Email from Communications</dt><dd>{send ? <span className="tag tone-muted">Off</span> : <span className="tag tone-good">On</span>} {send && <span className="small block">{send}</span>}</dd></div>
        </dl>
      </section>

      <section className="panel">
        <h2>Connections</h2>
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
        <h2>Data imports</h2>
        {(runs ?? []).length === 0 ? (
          <div className="empty-state">
            <h3>No imports have run yet</h3>
            <p className="small">The Final Hand import runs from GitHub Actions (Studio OS database → “Import The Final Hand”) once its Airtable token is added. A dry run comes first and changes nothing.</p>
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

      <section className="panel">
        <h2>More</h2>
        <ul className="plain">
          <li><Link className="link" href="/settings/users">User Access</Link> <span className="small">· invite people and set No/View/Edit per section and production</span></li>
          <li><Link className="link" href="/settings/productions">Productions</Link> <span className="small">· stages, sections in use and team roles</span></li>
          <li><Link className="link" href="/settings/audit">Audit log</Link> <span className="small">· every change to access, productions and records</span></li>
        </ul>
      </section>
    </>
  );
}
