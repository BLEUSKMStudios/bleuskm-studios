import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext, dbCheck } from "@/lib/hub/data";
import { isUuid } from "@/lib/sections";
import { FIELDS } from "@/lib/contracts/library";
import { byKey, formFields, loadTemplates, prefill } from "@/lib/contracts/data";
import { createAgreement } from "@/lib/contracts/actions";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { HubForm, Submit } from "@/components/hub/HubForm";

export const metadata = { title: "Send agreement" };

// Step 1 of Send Agreement: the recommended template, filled in from what
// Studio OS already knows. Saving makes a draft to preview before sending.
export default async function NewAgreementPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { me, productions } = await hubContext();
  const q = {
    application: isUuid(sp.application ?? "") ? sp.application : undefined,
    team: isUuid(sp.team ?? "") ? sp.team : undefined,
    contact: isUuid(sp.contact ?? "") ? sp.contact : undefined,
    production: isUuid(sp.production ?? "") ? sp.production : undefined,
  };
  const { supabase } = await loadSession();
  if (q.contact && !q.production && !q.application && !q.team) {
    return (
      <>
        <PageHead title="Send agreement" lead="Which production is this agreement for?" />
        <section className="panel narrow">
          <form action="/contracts/new" className="inline-form">
            <input type="hidden" name="contact" value={q.contact} />
            <label className="field"><span>Production</span><select name="production">{productions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
            <button className="btn btn-inline" type="submit">Continue</button>
          </form>
        </section>
      </>
    );
  }
  const pre = await prefill(supabase, q, me);
  if (!pre) return <NoAccess what="this person or production" />;
  if (!(await dbCheck(pre.productionId, "documents", "edit"))) return <NoAccess what="sending agreements on this production (Documents edit access)" />;
  const groups = byKey(await loadTemplates(supabase));
  const key = groups.some((g) => g.key === sp.template) ? sp.template! : pre.recommended;
  const g = groups.find((x) => x.key === key);
  const tpl = g?.approved ?? g?.latest;
  const keep = Object.entries(q).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  return (
    <>
      <PageHead title="Send agreement" lead={`${pre.signerName || "New signer"} · ${pre.productionTitle}${pre.role ? ` · ${pre.role}` : ""}`}>
        <Link className="btn btn-inline btn-quiet" href="/contracts">All agreements</Link>
      </PageHead>
      <section className="panel narrow">
        <form action="/contracts/new" className="inline-form">
          {keep}
          <label className="field"><span>Agreement</span>
            <select name="template" defaultValue={key}>
              {groups.map((x) => <option key={x.key} value={x.key}>{x.latest.name}{x.key === pre.recommended ? " (recommended)" : ""}{x.approved ? "" : " (not approved yet)"}</option>)}
            </select>
          </label>
          <button className="btn btn-inline btn-quiet" type="submit">Change</button>
        </form>
        {!groups.length && <p className="msg warn">No templates yet. {me.isOwner ? <Link className="link" href="/contracts/templates">Open the template library</Link> : "Ask the owner to set up the template library."}</p>}
        {g && !g.approved && <p className="msg warn">This template isn&apos;t approved yet. You can prepare and preview the agreement now; it can be sent once the owner approves the template.</p>}
      </section>
      {tpl && (
        <section className="panel">
          <h2>Details</h2>
          <p className="small">Filled in from the {pre.applicationId ? "application" : pre.teamId ? "roster" : "contact"}, the production&apos;s shoot days and confirmed locations. Anything left empty is stated in the agreement as &ldquo;to be confirmed in writing by BLEUSKM Studios&rdquo;, never guessed.</p>
          <HubForm action={createAgreement}>
            <input type="hidden" name="production_id" value={pre.productionId} />
            <input type="hidden" name="template_key" value={tpl.key} />
            {pre.applicationId && <input type="hidden" name="application_id" value={pre.applicationId} />}
            {pre.teamId && <input type="hidden" name="team_id" value={pre.teamId} />}
            {pre.contactId && <input type="hidden" name="contact_id" value={pre.contactId} />}
            <input type="hidden" name="crew" value={pre.crew === null ? "" : pre.crew ? "1" : "0"} />
            <label className="field"><span>Signer&apos;s email <em className="req">*</em></span><input type="email" name="signer_email" defaultValue={pre.signerEmail} required maxLength={254} /></label>
            {formFields(tpl.key, tpl.body).map((k) => {
              const f = FIELDS[k];
              const req = tpl.body.required.includes(k) || k === "recipient_name";
              return (
                <label key={k} className={`field${f.long ? " wide" : ""}`}><span>{f.label}{req && <> <em className="req">*</em></>}</span>
                  {f.long ? <textarea name={`f_${k}`} rows={3} defaultValue={pre.values[k] ?? ""} maxLength={5000} />
                    : <input name={`f_${k}`} defaultValue={pre.values[k] ?? ""} maxLength={500} required={req} />}
                  {f.hint && <span className="hint">{f.hint}</span>}
                </label>
              );
            })}
            <Submit busy="Preparing…">Prepare and preview</Submit>
          </HubForm>
        </section>
      )}
    </>
  );
}
