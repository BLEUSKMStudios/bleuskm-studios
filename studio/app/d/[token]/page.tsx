import "@/components/contracts/agreement.css";
import { packageByToken } from "@/lib/hub/onboarding-public";
import { formatStudioTime } from "@/lib/hub/casting-core";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your production materials · BLEUSKM Studios", robots: { index: false, follow: false } };

const KIND: Record<string, string> = {
  script: "Script", sides: "Sides", treatment: "Treatment", schedule: "Schedule", rehearsal: "Rehearsal schedule", call_sheet: "Call sheet",
  location_info: "Location & parking", guide: "Guide", report: "Report", other: "Document",
};

// A person's production materials. The link is the key; each file opens
// through a short-lived private link, and opens are recorded.
export default async function MaterialsPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const found = await packageByToken(token);
  if (!found) {
    return <main className="ag-page"><div className="ag"><div className="ag-done"><p className="ag-step">BLEUSKM Studios</p><h1>This link isn&apos;t valid</h1><p>It may have been withdrawn or replaced. Reply to our email and we&apos;ll help.</p></div></div></main>;
  }
  const { admin, pkg } = found;
  if (pkg.status === "sent") {
    await admin.from("onboarding_packages").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", pkg.id).eq("status", "sent");
  }
  return (
    <main className="ag-page">
      <div className="ag">
        <div className="ag-header"><div className="ag-header-left"><span className="ag-wordmark">BLEUSKM Studios</span><span className="ag-hdivider" /><span className="ag-label">Production materials</span></div><span className="ag-label">{pkg.film}</span></div>
        <div className="ag-rule" />
        <h1 className="ag-title">{pkg.film}</h1>
        <p className="ag-sub">For {pkg.name}</p>
        {pkg.message && <section className="ag-section"><div className="ag-body"><p className="ag-text">{pkg.message}</p></div></section>}
        <section className="ag-section"><div className="ag-body">
          {pkg.items.map((i, n) => (
            <div className="ag-clause" key={i.id}>
              <span className="ag-n">{String(n + 1).padStart(2, "0")}</span>
              <div style={{ flex: 1 }}>
                <p className="ag-clause-title">{KIND[i.category] ?? "Document"}</p>
                <p className="ag-text"><a className="ag-link" style={{ fontSize: 14, letterSpacing: "0.04em", textTransform: "none" }} href={`/d/${token}/${i.id}`} target="_blank" rel="noopener noreferrer">{i.title}</a>{i.opened ? " · opened" : ""}</p>
              </div>
            </div>
          ))}
        </div></section>
        {pkg.requireAck && (
          <section className="ag-section"><div className="ag-body">
            {pkg.acknowledgedAt || sp.done ? (
              <p className="ag-text">Thank you. You confirmed receiving these materials{pkg.acknowledgedAt ? ` on ${formatStudioTime(pkg.acknowledgedAt)}` : ""}.</p>
            ) : (
              <form method="post" action={`/d/${token}/ack`}>
                <p className="ag-step">Confirm you&apos;ve received them</p>
                <label className="ag-field"><span>Your name</span><input className="ag-input" name="name" required maxLength={200} defaultValue={pkg.name} /></label>
                <label className="ag-check"><input type="checkbox" name="ok" required /><span>I have received and opened these production materials and will keep them confidential.</span></label>
                <button className="ag-btn" type="submit">Confirm</button>
              </form>
            )}
          </div></section>
        )}
        <p className="ag-note">These materials are confidential and shared only with you. Links to files work for a short time; come back to this page to open them again.</p>
      </div>
    </main>
  );
}
