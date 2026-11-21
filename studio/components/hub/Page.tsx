export function PageHead({ title, lead, children }: { title: string; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

/** Shown wherever someone opens a page they have no access to. */
export function NoAccess({ what }: { what?: string }) {
  return (
    <div className="empty">
      <h1>No access</h1>
      <p className="lead">You don't have access to {what ?? "this page"}. If you need it, ask the studio owner.</p>
    </div>
  );
}

export function NotBuiltYet({ what }: { what: string }) {
  return (
    <div className="panel">
      <h2>{what} isn't built yet</h2>
      <p className="small">This section arrives in a later phase. Your access is already in place, so it will appear here when it's ready.</p>
    </div>
  );
}
