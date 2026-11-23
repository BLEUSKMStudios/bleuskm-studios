export function AuthCard({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <p className="eyebrow">BLEUSKM STUDIO OS</p>
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
    </main>
  );
}
