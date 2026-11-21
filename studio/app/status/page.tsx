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

async function loadStatus(): Promise<{ status?: Status; problem?: string }> {
  const admin = createAdminClient();
  if (!admin) return { problem: "The database credentials are not configured for this deployment yet." };
  try {
    const { data, error } = await admin.rpc("system_status");
    if (error) return { problem: "The database answered with an error. The schema may not be applied yet." };
    return { status: data as Status };
  } catch {
    return { problem: "The database could not be reached." };
  }
}

const cell: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #2a2a2a", textAlign: "left" };
const ok = (v: boolean) => <span style={{ color: v ? "#7bd88f" : "#ff6b6b", fontWeight: 600 }}>{v ? "Yes" : "No"}</span>;

export default async function StatusPage() {
  const { status, problem } = await loadStatus();
  const allLocked = status ? status.tables.every((t) => t.rls && t.policies > 0) && status.anon_table_privileges === 0 : false;

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "32px 16px 64px" }}>
      <p style={{ color: "var(--gold)", letterSpacing: "0.3em", fontSize: 12, fontWeight: 600, margin: 0 }}>BLEUSKM STUDIO OS</p>
      <h1 style={{ fontWeight: 900, margin: "8px 0 4px" }}>System status</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>Database and permission rules (Phase 1, step 1B). No personal data is shown.</p>

      {problem && (
        <p style={{ background: "var(--surface)", borderLeft: "4px solid #ff6b6b", padding: "12px 14px" }}>{problem}</p>
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

          <h2 style={{ fontSize: 18 }}>Records</h2>
          <p style={{ color: "var(--muted)" }}>
            {Object.entries(status.counts).map(([k, v]) => `${k.replace("_", " ")}: ${v}`).join(" · ")}
          </p>
        </>
      )}
    </main>
  );
}
