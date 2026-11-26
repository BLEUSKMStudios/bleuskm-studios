import "./agreement.css";
import type { Rendered } from "@/lib/contracts/render";
import { UNKNOWN } from "@/lib/contracts/library";
import { signatureFont } from "./font";

/** Highlights wording that still has to be confirmed, so nobody misses it. */
function Text({ text }: { text: string }) {
  const parts = text.split(UNKNOWN);
  return (
    <p className="ag-text">
      {parts.map((p, i) => (
        <span key={i}>{p}{i < parts.length - 1 && <span className="ag-tbc">{UNKNOWN}</span>}</span>
      ))}
    </p>
  );
}

export type SignatureShown = { name: string; title?: string; image?: string | null; date?: string | null } | null;

/**
 * One agreement in the BLEUSKM house design: header, party bar, numbered
 * sections and the signature block. Used for the staff preview, the signer's
 * page and the signed view, so all three show the same thing.
 */
export function AgreementView({ a, reviewNotes, studioSig, signerSig, banner, children }: {
  a: Rendered;
  reviewNotes?: Record<string, string>;
  studioSig?: SignatureShown;
  signerSig?: SignatureShown;
  banner?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`ag ${signatureFont.variable}`}>
      <div className="ag-header">
        <div className="ag-header-left">
          <span className="ag-wordmark">BLEUSKM Studios</span>
          <span className="ag-hdivider" />
          <span className="ag-label">{a.docLabel}</span>
        </div>
        <span className="ag-label">{a.production}</span>
      </div>
      <div className="ag-rule" />
      {banner && <div className="ag-watermark">{banner}</div>}
      <h1 className="ag-title">{a.title}</h1>
      <p className="ag-sub">{a.template.name} · version {a.template.version}</p>
      <div className="ag-party">
        {a.party.map((p) => (
          <div className="ag-cell" key={p.label}>
            <span className="ag-cell-lbl">{p.label}</span>
            <span className={`ag-cell-val${p.value === "To be confirmed" ? " ag-tbc" : ""}`}>{p.value}</span>
          </div>
        ))}
      </div>
      <section className="ag-section">
        <div className="ag-body">
          {a.clauses.map((c) => (
            <div className="ag-clause" key={c.n}>
              <span className="ag-n">{String(c.n).padStart(2, "0")}</span>
              <div style={{ flex: 1 }}>
                <h2 className="ag-clause-title">{c.title}</h2>
                <Text text={c.text} />
                {reviewNotes?.[c.title] && <p className="ag-review">Attorney review: {reviewNotes[c.title]}</p>}
              </div>
            </div>
          ))}
          <p className="ag-note">{a.signNote}</p>
        </div>
      </section>
      <section className="ag-section">
        <div className="ag-body">
          <div className="ag-sig-grid">
            <div>
              <p className="ag-sig-lbl">BLEUSKM Studios</p>
              <div className="ag-sig-display" style={{ fontFamily: "var(--font-signature)" }}>
                {studioSig?.image ? <img src={studioSig.image} alt={`Signature of ${studioSig.name}`} /> : studioSig ? studioSig.name : null}
              </div>
              <p className="ag-sig-name">{studioSig?.name ?? a.studio.name}{(studioSig?.title ?? a.studio.title) ? `, ${studioSig?.title ?? a.studio.title}` : ""}</p>
              {studioSig?.date && <p className="ag-sig-name">{studioSig.date}</p>}
            </div>
            <div>
              <p className="ag-sig-lbl">{a.signerLabel}</p>
              {children ?? (
                <>
                  <div className="ag-sig-display" style={{ fontFamily: "var(--font-signature)" }}>
                    {signerSig?.image ? <img src={signerSig.image} alt={`Signature of ${signerSig.name}`} /> : signerSig?.name ?? null}
                  </div>
                  <p className="ag-sig-name">{signerSig?.name ?? a.signer.name}</p>
                  {signerSig?.date && <p className="ag-sig-name">{signerSig.date}</p>}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
