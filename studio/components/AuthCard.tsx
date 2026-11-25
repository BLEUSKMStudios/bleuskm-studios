export function AuthCard({ title, lead, children, eyebrow = "BLEUSKM STUDIO OS" }: { title: string; lead?: string; children: React.ReactNode; eyebrow?: string }) {
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
    </main>
  );
}
