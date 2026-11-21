import { createAdminClient } from "@/lib/supabase/admin";

// Step 1B review page: proves the Preview reaches the database and shows how
// it is locked down. Server-rendered on every request; shows counts and
// schema facts only, never personal data.
export const dynamic = "force-dynamic";
export const metadata = { title: "System status · BLEUSKM Studio OS" };

type Status = {
  migrations: string[];
  tables: { name: string; rls: boolean; policies: number }[];
  sections: { key: string; label: string; grantable: boolean; studio: boolean; production: boolean }[];
  counts: Record<string, number>;
  anon_table_privileges: number;
};

type Check = { label: string; ok: boolean | null; note: string };

// Checks that each configured credential is accepted, without ever showing a value.
async function loadStatus(): Promise<{ status?: Status; problem?: string; checks: Check[] }> {
  const checks: Check[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Publishable key: ask Supabase Auth for its public settings.
  if (url && publishable) {
    try {
      const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishable }, cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { disable_signup?: boolean };
        checks.push({ label: "Project address and publishable key", ok: true, note: "Accepted by Supabase." });
        checks.push({
          label: "Public sign-up switched off",
          ok: body.disable_signup === true,
          note: body.disable_signup === true ? "Nobody can create an account." : "Sign-up is open. Switch it off in Supabase.",
        });
      } else {
        checks.push({ label: "Project address and publishable key", ok: false, note: `Rejected (HTTP ${res.status}).` });
      }
    } catch {
      checks.push({ label: "Project address and publishable key", ok: false, note: "Supabase could not be reached." });
    }
  } else {
    checks.push({ label: "Project address and publishable key", ok: false, note: "Not configured for this deployment." });
  }

  // Secret key: call the server-only status function.
  const admin = createAdminClient();
  if (!admin) {
    checks.push({ label: "Secret key (server only)", ok: false, note: "Not configured for this deployment." });
    return { checks, problem: "The database credentials are not configured for this deployment yet." };
  }
  try {
    const { data, error } = await admin.rpc("system_status");
    if (!error) {
      checks.push({ label: "Secret key (server only)", ok: true, note: "Accepted by Supabase." });
      return { checks, status: data as Status };
    }
    // PGRST202: the key was accepted but the function does not exist yet.
    if (error.code === "PGRST202" || error.code === "42883") {
      checks.push({ label: "Secret key (server only)", ok: true, note: "Accepted by Supabase." });
      return { checks, problem: "Connected. The Studio OS database schema has not been applied to this project yet." };
    }
    checks.push({ label: "Secret key (server only)", ok: false, note: "Rejected by Supabase." });
    return { checks, problem: "The database answered with an error." };
  } catch {
    checks.push({ label: "Secret key (server only)", ok: false, note: "Supabase could not be reached." });
    return { checks, problem: "The database could not be reached." };
  }
}

type Probe = { target: string; denied: boolean; detail: string };

// Live test: ask the Data API for each table and server function exactly as a
// signed-out visitor would (publishable key only). Every request must be refused.
async function probeSignedOut(tables: string[]): Promise<Probe[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  const headers = { apikey: key, "Content-Type": "application/json" };
  const requests: { target: string; run: () => Promise<Response> }[] = [
    ...tables.map((t) => ({ target: `Read ${t}`, run: () => fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers, cache: "no-store" }) })),
    { target: "Add a production", run: () => fetch(`${url}/rest/v1/productions`, { method: "POST", headers, body: JSON.stringify({ slug: "probe", title: "Probe", type: "film" }), cache: "no-store" }) },
    { target: "Give itself access", run: () => fetch(`${url}/rest/v1/access_grants`, { method: "POST", headers, body: JSON.stringify({ section_key: "casting", level: "edit" }), cache: "no-store" }) },
    ...["check_access_for", "system_status"].map((f) => ({ target: `Call ${f}`, run: () => fetch(`${url}/rest/v1/rpc/${f}`, { method: "POST", headers, body: "{}", cache: "no-store" }) })),
  ];
  return Promise.all(
    requests.map(async ({ target, run }) => {
      try {
        const res = await run();
        return { target, denied: !res.ok, detail: res.ok ? `Allowed (HTTP ${res.status})` : `Refused (HTTP ${res.status})` };
      } catch {
        return { target, denied: false, detail: "Could not test" };
      }
    }),
  );
}

const cell: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #2a2a2a", textAlign: "left" };
const ok = (v: boolean) => <span style={{ color: v ? "#7bd88f" : "#ff6b6b", fontWeight: 600 }}>{v ? "Yes" : "No"}</span>;

export default async function StatusPage() {
  const { status, problem, checks } = await loadStatus();
  const probes = status ? await probeSignedOut(status.tables.map((t) => t.name)) : [];
  const allLocked = status ? status.tables.every((t) => t.rls && t.policies > 0) && status.anon_table_privileges === 0 : false;

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "32px 16px 64px" }}>
      <p style={{ color: "var(--gold)", letterSpacing: "0.3em", fontSize: 12, fontWeight: 600, margin: 0 }}>BLEUSKM STUDIO OS</p>
      <h1 style={{ fontWeight: 900, margin: "8px 0 4px" }}>System status</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>Database and permission rules (Phase 1, step 1B). No personal data is shown.</p>

      <h2 style={{ fontSize: 18 }}>Credentials</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead><tr><th style={cell}>Check</th><th style={cell}>Passed</th><th style={cell}>Detail</th></tr></thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.label}><td style={cell}>{c.label}</td><td style={cell}>{ok(c.ok === true)}</td><td style={cell}>{c.note}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {problem && (
        <p style={{ background: "var(--surface)", borderLeft: `4px solid ${problem.startsWith("Connected.") ? "var(--gold)" : "#ff6b6b"}`, padding: "12px 14px" }}>{problem}</p>
      )}

      {status && (
        <>
          <section style={{ background: "var(--surface)", borderLeft: `4px solid ${allLocked ? "#7bd88f" : "#ff6b6b"}`, padding: "12px 14px", margin: "16px 0" }}>
            <strong>Database connected.</strong>{" "}
            {allLocked
              ? "Every table has Row Level Security switched on with rules in place, and signed-out visitors have no access to any table."
              : "Warning: at least one table is not fully locked down."}
          </section>

          <h2 style={{ fontSize: 18 }}>Applied migrations</h2>
          <p style={{ color: "var(--muted)" }}>{status.migrations.length ? status.migrations.join(", ") : "None recorded"}</p>

          <h2 style={{ fontSize: 18 }}>Tables</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
              <thead><tr><th style={cell}>Table</th><th style={cell}>Row Level Security</th><th style={cell}>Rules</th></tr></thead>
              <tbody>
                {status.tables.map((t) => (
                  <tr key={t.name}><td style={cell}>{t.name}</td><td style={cell}>{ok(t.rls)}</td><td style={cell}>{t.policies}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: 18 }}>Sections</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
              <thead><tr><th style={cell}>Section</th><th style={cell}>Grantable</th><th style={cell}>Studio level</th><th style={cell}>Per production</th></tr></thead>
              <tbody>
                {status.sections.map((s) => (
                  <tr key={s.key}><td style={cell}>{s.label}</td><td style={cell}>{ok(s.grantable)}</td><td style={cell}>{ok(s.studio)}</td><td style={cell}>{ok(s.production)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: 18 }}>Live test as a signed-out visitor</h2>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            {probes.every((p) => p.denied) ? `All ${probes.length} requests were refused.` : "Warning: at least one request was allowed."}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
              <thead><tr><th style={cell}>Attempt</th><th style={cell}>Refused</th><th style={cell}>Result</th></tr></thead>
              <tbody>
                {probes.map((p) => (
                  <tr key={p.target}><td style={cell}>{p.target}</td><td style={cell}>{ok(p.denied)}</td><td style={cell}>{p.detail}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: 18 }}>Records</h2>
          <p style={{ color: "var(--muted)" }}>
            {Object.entries(status.counts).map(([k, v]) => `${k.replace("_", " ")}: ${v}`).join(" · ")}
          </p>
        </>
      )}
    </main>
  );
}
