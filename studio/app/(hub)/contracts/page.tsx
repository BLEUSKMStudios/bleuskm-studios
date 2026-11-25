import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext } from "@/lib/hub/data";
import { holdsSection } from "@/lib/hub/nav";
import { isMissingTable } from "@/lib/hub/modules";
import { formatStudioTime } from "@/lib/hub/casting-core";
import { STATUS_LABEL, STATUS_TONE, effectiveStatus, type RequestRow } from "@/lib/contracts/data";
import { sendAgreement } from "@/lib/contracts/actions";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { SetupPending } from "@/components/hub/ModuleView";
import { HubForm, Submit } from "@/components/hub/HubForm";

export const metadata = { title: "Contracts" };

type Row = Pick<RequestRow, "id" | "production_id" | "template_key" | "template_version" | "signer_name" | "signer_email" | "status" | "expires_at" | "sent_at" | "signed_at" | "created_at" | "content_text">;
const STATUSES = ["draft", "sent", "viewed", "signed", "expired", "voided"] as const;

// Every agreement across the productions this person can see, with the
// drafts waiting for review at the top.
export default async function ContractsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { me, grants, productions } = await hubContext();
  if (!me.isOwner && !holdsSection(grants, "documents")) return <NoAccess what="Contracts" />;
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as never) ? sp.status! : "";
  const prodId = productions.some((p) => p.id === sp.production) ? sp.production! : "";
  const { supabase } = await loadSession();
  let q = supabase.from("contract_requests").select("id, production_id, template_key, template_version, signer_name, signer_email, status, expires_at, sent_at, signed_at, created_at, content_text").order("created_at", { ascending: false }).limit(500);
  if (status && status !== "expired") q = q.eq("status", status);
  if (prodId) q = q.eq("production_id", prodId);
  const { data, error } = await q;
  if (isMissingTable(error?.code)) return <><PageHead title="Contracts" /><section className="panel"><SetupPending what="Contracts" /></section></>;
  let rows = (data ?? []) as Row[];
  if (status === "expired") rows = rows.filter((r) => effectiveStatus(r) === "expired");
  const { data: tpls } = await supabase.from("contract_templates").select("key, name, status");
  const tplName = new Map((tpls ?? []).map((t) => [t.key as string, t.name as string]));
  const approved = new Set((tpls ?? []).filter((t) => t.status === "approved").map((t) => t.key as string));
  const prod = (id: string) => productions.find((p) => p.id === id);
  const drafts = rows.filter((r) => r.status === "draft");
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as Row[]) { const s = effectiveStatus(r); counts.set(s, (counts.get(s) ?? 0) + 1); }

  return (
    <>
      <PageHead title="Contracts & Agreements" lead="Prepare, review, send and track agreements. Signers sign on a secure BLEUSKM page with an email code; signed PDFs are filed in Documents automatically.">
        <Link className="btn btn-inline btn-quiet" href="/contracts/templates">Templates</Link>
      </PageHead>
      {!approved.size && (
        <p className="msg warn">No agreement template is approved yet, so nothing can be sent. {me.isOwner ? <Link className="link" href="/contracts/templates">Review and approve templates</Link> : "The owner approves templates once under Contracts, Templates."}</p>
      )}
      <section className="panel">
        <form className="inline-form" action="/contracts">
          <label className="field"><span>Production</span>
            <select name="production" defaultValue={prodId}><option value="">All</option>{productions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
          </label>
          <label className="field"><span>Status</span>
            <select name="status" defaultValue={status}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}{counts.get(s) ? ` (${counts.get(s)})` : ""}</option>)}</select>
          </label>
          <button className="btn btn-inline" type="submit">Filter</button>
        </form>
        <p className="small">To prepare an agreement, open an applicant, a roster member or a contact and choose Send agreement.</p>
      </section>

      {drafts.length > 1 && (
        <section className="panel">
          <h2>Send reviewed drafts</h2>
          <HubForm action={sendAgreement} className="">
            <table className="table"><tbody>
              {drafts.map((r) => (
                <tr key={r.id}>
                  <td><input type="checkbox" name="id" value={r.id} aria-label={`Send to ${r.signer_name}`} /></td>
                  <th><Link href={`/contracts/${r.id}`}>{r.signer_name}</Link></th>
                  <td>{tplName.get(r.template_key) ?? r.template_key}</td>
                  <td>{prod(r.production_id)?.title}</td>
                </tr>
              ))}
            </tbody></table>
            <label className="field"><input type="checkbox" name="reviewed" /> I&apos;ve opened and reviewed the preview of each agreement I&apos;ve ticked.</label>
            <Submit busy="Sending…">Send selected</Submit>
          </HubForm>
        </section>
      )}

      <section className="panel">
        {rows.length ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Signer</th><th>Agreement</th><th>Production</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const s = effectiveStatus(r);
                return (
                  <tr key={r.id}>
                    <th><Link href={`/contracts/${r.id}`}>{r.signer_name}</Link><div className="small">{r.signer_email}</div></th>
                    <td>{tplName.get(r.template_key) ?? r.template_key} <span className="small">v{r.template_version}</span></td>
                    <td>{prod(r.production_id)?.title ?? ""}</td>
                    <td><span className={`tag tone-${STATUS_TONE[s]}`}>{STATUS_LABEL[s]}</span>{r.status === "draft" && r.content_text ? <span className="small"> approved, not sent</span> : null}</td>
                    <td className="small">{formatStudioTime(r.signed_at ?? r.sent_at ?? r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        ) : <p className="small">No agreements yet.</p>}
      </section>
    </>
  );
}
