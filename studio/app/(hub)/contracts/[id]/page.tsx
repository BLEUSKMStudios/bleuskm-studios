import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext, dbCheck } from "@/lib/hub/data";
import { isUuid } from "@/lib/sections";
import { formatStudioTime } from "@/lib/hub/casting-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { FIELDS } from "@/lib/contracts/library";
import { renderAgreement, thaw } from "@/lib/contracts/render";
import { REQUEST_COLS, SIGNATURE_BUCKET, STATUS_LABEL, STATUS_TONE, STUDIO_SIGNATURE_PATH, TEMPLATE_COLS, effectiveStatus, formFields, type RequestRow, type TemplateRow } from "@/lib/contracts/data";
import { deleteDraft, remindAgreement, saveAgreement, sendAgreement, verifyCopy, voidAgreement } from "@/lib/contracts/actions";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { ActionForm } from "@/components/hub/ActionForm";
import { AgreementView } from "@/components/contracts/AgreementView";

export const metadata = { title: "Agreement" };
type Event = { id: number; at: string; kind: string; actor: string; actor_name: string | null; ip: string | null; detail: Record<string, unknown> };

export default async function AgreementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { me, productions } = await hubContext();
  if (!isUuid(id)) return <NoAccess what="this agreement" />;
  const { supabase } = await loadSession();
  const { data: r } = await supabase.from("contract_requests").select(REQUEST_COLS).eq("id", id).maybeSingle<RequestRow>();
  if (!r) return <NoAccess what="this agreement" />;
  const [canEdit, { data: tplRow }, { data: evRows }, { data: chain }, { data: team }] = await Promise.all([
    dbCheck(r.production_id, "documents", "edit"),
    supabase.from("contract_templates").select(TEMPLATE_COLS).eq("id", r.template_id).maybeSingle<TemplateRow>(),
    supabase.from("contract_events").select("id, at, kind, actor, actor_name, ip, detail").eq("request_id", id).order("id"),
    supabase.rpc("contract_verify_chain", { p_request: id }),
    r.team_id || r.application_id
      ? supabase.from("production_team").select("id, onboarding, status").or(`id.eq.${r.team_id ?? "00000000-0000-0000-0000-000000000000"},application_id.eq.${r.application_id ?? "00000000-0000-0000-0000-000000000000"}`).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const events = (evRows ?? []) as Event[];
  const state = effectiveStatus(r);
  const prod = productions.find((p) => p.id === r.production_id);
  const frozen = thaw(r.content_text, r.content_hash);
  const integrityOk = !r.content_text || !!frozen;
  const preview = frozen ?? (tplRow ? renderAgreement({ id: r.id, template: { key: tplRow.key, version: tplRow.version, name: tplRow.name, body: tplRow.body }, values: r.fields, signer: { name: r.signer_name, email: r.signer_email } }) : null);
  const editable = canEdit && r.status === "draft" && !r.content_text;
  let hasStudioSig = false;
  if (me.isOwner && r.status === "draft") {
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin.storage.from(SIGNATURE_BUCKET).list("contracts/studio", { search: "signature.png" });
      hasStudioSig = !!data?.some((o) => `contracts/studio/${o.name}` === STUDIO_SIGNATURE_PATH);
    }
  }
  const missing = tplRow ? tplRow.body.required.filter((k) => !(k === "recipient_name" ? r.signer_name : r.fields[k])) : [];

  return (
    <>
      <PageHead title={`${tplRow?.name ?? r.template_key}: ${r.signer_name}`} lead={<>{prod?.title} · {r.signer_email} · <span className={`tag tone-${STATUS_TONE[state]}`}>{STATUS_LABEL[state]}</span></>}>
        <Link className="btn btn-inline btn-quiet" href="/contracts">All agreements</Link>
      </PageHead>

      {sp.sent && r.status !== "draft" && <p className="msg" role="status">Sent. The signer has a personal link by email from {r.identity_key}@bleuskm.com.</p>}
      {sp.voided && r.status === "voided" && <p className="msg" role="status">Voided. The signing link no longer works.</p>}
      {!integrityOk && <p className="msg error">The stored wording of this agreement does not match its fingerprint. Don&apos;t rely on it; tell the studio owner.</p>}
      {tplRow && !tplRow.attorney_reviewed && <p className="msg warn">This template version hasn&apos;t been reviewed by an attorney.</p>}

      <section className="panel">
        <h2>Status</h2>
        <ul className="plain">
          <li>Prepared {formatStudioTime(r.created_at)} · template {r.template_key} v{r.template_version}</li>
          {r.approved_at && <li>Wording approved {formatStudioTime(r.approved_at)} · SHA-256 <code>{r.content_hash?.slice(0, 16)}…</code></li>}
          {r.sent_at && <li>Sent {formatStudioTime(r.sent_at)} from {r.identity_key}@ · link valid until {formatStudioTime(r.expires_at)}</li>}
          {r.viewed_at && <li>Opened {formatStudioTime(r.viewed_at)}</li>}
          {r.signed_at && <li>Signed {formatStudioTime(r.signed_at)} by {r.signed_name} ({r.signature_kind === "drawn" ? "drawn" : "typed"} signature, email verified {formatStudioTime(r.verified_at)}, IP {r.signer_ip ?? "not recorded"})</li>}
          {r.voided_at && <li>Voided {formatStudioTime(r.voided_at)}: {r.void_reason}</li>}
          {team && <li>Onboarding: {String(team.onboarding).replace(/_/g, " ")} · roster status {team.status}</li>}
        </ul>
        <p className="small">
          {r.application_id && <><Link className="link" href={`/productions/${prod?.slug}/casting/applicants/${r.application_id}`}>Application</Link> · </>}
          {r.contact_id && <><Link className="link" href={`/contacts/${r.contact_id}`}>Contact profile</Link> · </>}
          {r.document_id && <Link className="link" href={`/documents`}>Filed in Documents</Link>}
        </p>
        {r.status === "signed" && (
          <div className="row-actions">
            <a className="btn btn-inline" href={`/api/contracts/${r.id}/pdf`}>Download signed PDF</a>
            <a className="btn btn-inline btn-quiet" href={`/api/contracts/${r.id}/pdf?view=1`} target="_blank" rel="noopener noreferrer">View / print</a>
          </div>
        )}
      </section>

      {canEdit && r.status === "draft" && (
        <section className="panel">
          <h2>Review and send</h2>
          {missing.length > 0 && <p className="msg warn">Fill in before sending: {missing.map((k) => FIELDS[k]?.label ?? k).join(", ")}.</p>}
          {preview && preview.unconfirmed.length > 0 && <p className="msg warn">Not known yet, so the agreement says they&apos;ll be confirmed in writing: {preview.unconfirmed.map((k) => FIELDS[k]?.label ?? k).join(", ")}.</p>}
          <HubForm action={sendAgreement}>
            <input type="hidden" name="id" value={r.id} />
            <label className="field"><span>Link valid for (days)</span><input type="number" name="days" defaultValue={14} min={1} max={60} /></label>
            {hasStudioSig && <label className="field"><input type="checkbox" name="studio_image" /> Use my signature image (otherwise my typed name)</label>}
            <label className="field wide"><input type="checkbox" name="reviewed" /> I&apos;ve reviewed the preview below. Send it to {r.signer_email} from {r.identity_key}@bleuskm.com.</label>
            <Submit busy="Sending…">{r.content_text ? "Send" : "Approve wording and send"}</Submit>
          </HubForm>
          <ActionForm action={deleteDraft} fields={{ id: r.id }} label="Delete draft" busy="Deleting…" quiet confirm="Delete this draft?" />
        </section>
      )}

      {canEdit && ["sent", "viewed", "expired"].includes(state) && (
        <section className="panel">
          <h2>Follow up</h2>
          <div className="row-actions">
            {state !== "expired" && <ActionForm action={remindAgreement} fields={{ id: r.id, mode: "remind" }} label="Send reminder" busy="Sending…" />}
            <ActionForm action={remindAgreement} fields={{ id: r.id, mode: "resend", days: "14" }} label="Re-send with a new 14-day link" busy="Sending…" quiet />
          </div>
          <HubForm action={voidAgreement} confirm="Void this agreement? The link stops working.">
            <input type="hidden" name="id" value={r.id} />
            <label className="field wide"><span>Void: reason (kept in the audit trail)</span><input name="reason" maxLength={1000} /></label>
            <Submit quiet busy="Voiding…">Void agreement</Submit>
          </HubForm>
        </section>
      )}

      {editable && tplRow && (
        <section className="panel">
          <h2>Edit details</h2>
          <HubForm action={saveAgreement}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="template_key" value={r.template_key} />
            <label className="field"><span>Signer&apos;s email</span><input type="email" name="signer_email" defaultValue={r.signer_email} required /></label>
            {formFields(tplRow.key, tplRow.body).map((k) => {
              const f = FIELDS[k];
              const v = k === "recipient_name" ? r.signer_name : r.fields[k] ?? "";
              return (
                <label key={k} className={`field${f.long ? " wide" : ""}`}><span>{f.label}</span>
                  {f.long ? <textarea name={`f_${k}`} rows={3} defaultValue={v} maxLength={5000} /> : <input name={`f_${k}`} defaultValue={v} maxLength={500} />}
                  {f.hint && <span className="hint">{f.hint}</span>}
                </label>
              );
            })}
            <Submit>Save and refresh preview</Submit>
          </HubForm>
        </section>
      )}

      {preview && (
        <section className="panel">
          <h2>{r.status === "draft" ? "Preview" : "The agreement as sent"}</h2>
          <div style={{ background: "#080808", padding: "24px 8px" }}>
            <AgreementView a={preview} banner={r.status === "draft" ? "Preview · not sent" : undefined}
              studioSig={r.studio_signer ? { name: r.studio_signer.name, title: r.studio_signer.title } : null}
              signerSig={r.signed_name ? { name: r.signed_name, date: formatStudioTime(r.signed_at) } : null} />
          </div>
        </section>
      )}

      {r.status === "signed" && (
        <section className="panel narrow">
          <h2>Verify a copy</h2>
          <p className="small">Check that a PDF someone sends you is identical to the signed original. Signed PDF SHA-256: <code>{r.pdf_sha256}</code></p>
          <HubForm action={verifyCopy}>
            <input type="hidden" name="id" value={r.id} />
            <label className="field"><span>PDF</span><input type="file" name="file" accept="application/pdf" required /></label>
            <Submit busy="Checking…">Verify</Submit>
          </HubForm>
        </section>
      )}

      <section className="panel">
        <h2>Audit trail</h2>
        <p className="small">{chain === true ? "Hash chain intact: no entry has been removed or altered." : chain === false ? "Warning: the hash chain does not verify." : ""}</p>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>When</th><th>Event</th><th>By</th><th>Details</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="small">{formatStudioTime(e.at)}</td>
                <td>{e.kind.replace(/_/g, " ")}</td>
                <td className="small">{e.actor}{e.actor_name ? ` · ${e.actor_name}` : ""}{e.ip ? ` · IP ${e.ip}` : ""}</td>
                <td className="small">{Object.entries(e.detail ?? {}).filter(([k]) => !["consent", "agreed"].includes(k)).map(([k, v]) => `${k}: ${typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v)}`).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
