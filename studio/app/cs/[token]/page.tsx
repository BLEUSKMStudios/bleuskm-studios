import "@/components/contracts/agreement.css";
import { sendByToken } from "@/lib/callsheets/public";
import { callFor, dateLabel, groupEntries, timeLabel } from "@/lib/callsheets/sheet";
import { formatStudioTime } from "@/lib/hub/casting-core";

export const dynamic = "force-dynamic";
export const metadata = { title: "Call sheet · BLEUSKM Studios", robots: { index: false, follow: false } };

function Invalid({ title, text }: { title: string; text: string }) {
  return <main className="ag-page"><div className="ag"><div className="ag-done"><p className="ag-step">BLEUSKM Studios</p><h1>{title}</h1><p>{text}</p></div></div></main>;
}

// One person's call sheet: their call time first, then the whole sheet. The
// link is the key; opening it and confirming are recorded.
export default async function CallSheetPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const found = await sendByToken(token);
  if (!found) return <Invalid title="This link isn't valid" text="It may have been withdrawn. Reply to our email and we'll help." />;
  const { admin, send, sheet, current } = found;
  if (send.status === "replaced" || !current) {
    return <Invalid title="This call sheet was updated" text="A newer version has been sent to you by email. Please use the latest one." />;
  }
  if (send.status === "sent") {
    await admin.from("call_sheet_sends").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", send.id).eq("status", "sent");
  }
  const me = sheet.entries.find((e) => e.id === send.entryId) ?? null;
  const myCall = timeLabel(callFor(sheet, me));
  const info: [string, string | null][] = [
    ["Location", sheet.location], ["Parking", sheet.parking], ["Nearest hospital", sheet.hospital], ["Safety", sheet.safety],
    ["Key contacts", sheet.keyContacts], ["Weather", sheet.weather], ["Sunrise / sunset", [sheet.sunrise, sheet.sunset].filter(Boolean).join(" / ") || null],
    ["Day schedule", sheet.schedule], ["Notes", sheet.notes],
  ];
  return (
    <main className="ag-page">
      <div className="ag">
        <div className="ag-header"><div className="ag-header-left"><span className="ag-wordmark">BLEUSKM Studios</span><span className="ag-hdivider" /><span className="ag-label">Call sheet</span></div><span className="ag-label">Version {sheet.version}</span></div>
        <div className="ag-rule" />
        <h1 className="ag-title">{sheet.production}</h1>
        <p className="ag-sub">{sheet.title} · {dateLabel(sheet.shootDate)}</p>
        <div className="ag-party">
          <div className="ag-cell"><span className="ag-cell-lbl">Your call</span><strong className="ag-cell-val">{myCall || "To be confirmed"}</strong></div>
          <div className="ag-cell"><span className="ag-cell-lbl">General call</span><strong className="ag-cell-val">{timeLabel(sheet.generalCall) || "TBC"}</strong></div>
          {sheet.crewCall && <div className="ag-cell"><span className="ag-cell-lbl">Crew call</span><strong className="ag-cell-val">{timeLabel(sheet.crewCall)}</strong></div>}
          <div className="ag-cell"><span className="ag-cell-lbl">For</span><strong className="ag-cell-val">{send.name}{me?.position ? ` · ${me.position}` : ""}</strong></div>
        </div>
        <section className="ag-section"><div className="ag-body">
          {info.filter(([, v]) => v).map(([k, v], n) => (
            <div className="ag-clause" key={k}>
              <span className="ag-n">{String(n + 1).padStart(2, "0")}</span>
              <div style={{ flex: 1 }}><p className="ag-clause-title">{k}</p><p className="ag-text" style={{ whiteSpace: "pre-line" }}>{v}</p></div>
            </div>
          ))}
        </div></section>
        <section className="ag-section"><div className="ag-body">
          {groupEntries(sheet.entries).map((g) => (
            <div key={g.team} style={{ marginBottom: 18 }}>
              <p className="ag-clause-title">{g.label}</p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <tbody>
                  {g.rows.map((e) => (
                    <tr key={e.id} style={e.id === send.entryId ? { background: "rgba(218,175,55,0.15)" } : undefined}>
                      <td style={{ padding: "4px 6px" }}>{e.name}</td>
                      <td style={{ padding: "4px 6px", opacity: 0.8 }}>{e.position ?? ""}</td>
                      <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>{timeLabel(callFor(sheet, e)) || "TBC"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p className="ag-text"><a className="ag-link" href={`/cs/${token}/pdf`}>Download the PDF</a></p>
        </div></section>
        <section className="ag-section"><div className="ag-body">
          {send.confirmedAt || sp.done ? (
            <p className="ag-text">Thanks, you confirmed this call sheet{send.confirmedAt ? ` on ${formatStudioTime(send.confirmedAt)}` : ""}. See you on set.</p>
          ) : (
            <form method="post" action={`/cs/${token}/confirm`}>
              <p className="ag-step">Got it?</p>
              <button className="ag-btn" type="submit">I&apos;ve got my call time</button>
            </form>
          )}
        </div></section>
        <p className="ag-note">Confidential. Please don&apos;t share this call sheet.</p>
      </div>
    </main>
  );
}
