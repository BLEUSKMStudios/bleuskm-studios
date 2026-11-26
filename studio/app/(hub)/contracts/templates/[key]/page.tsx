import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext } from "@/lib/hub/data";
import { holdsSection } from "@/lib/hub/nav";
import { formatStudioTime } from "@/lib/hub/casting-core";
import { FIELDS } from "@/lib/contracts/library";
import { clausesToText, renderAgreement } from "@/lib/contracts/render";
import { loadTemplates, type TemplateRow } from "@/lib/contracts/data";
import { approveTemplate, saveTemplate, setAttorneyReview } from "@/lib/contracts/actions";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { AgreementView } from "@/components/contracts/AgreementView";

export const metadata = { title: "Agreement template" };

// One master template: preview with sample values, review notes, version
// history, and (owner) editing and approval.
export default async function TemplatePage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { key } = await params;
  const sp = await searchParams;
  const { me, grants } = await hubContext();
  if (!me.isOwner && !holdsSection(grants, "documents")) return <NoAccess what="agreement templates" />;
  const { supabase } = await loadSession();
  const versions = (await loadTemplates(supabase)).filter((t) => t.key === key).sort((a, b) => b.version - a.version);
  if (!versions.length) return <NoAccess what="this template" />;
  const shown: TemplateRow = versions.find((v) => String(v.version) === sp.v) ?? versions[0];
  const approved = versions.find((v) => v.status === "approved");
  const sample = renderAgreement({
    id: "preview", template: { key: shown.key, version: shown.version, name: shown.name, body: shown.body },
    signer: { name: "Sample Name", email: "sample@example.com" },
    values: { production_title: "Love Me Like This", role: shown.audience === "crew" ? "Gaffer" : "Sosa", department: shown.audience === "crew" ? "Lighting" : "Cast", studio_rep_name: me.fullName, studio_rep_title: "Owner" },
  });
  const reviewNotes = Object.fromEntries(shown.body.clauses.filter((c) => c.review).map((c) => [c.title, c.review!]));

  return (
    <>
      <PageHead title={shown.name} lead={`Version ${shown.version} · ${shown.status === "approved" ? "approved and in use" : shown.status === "retired" ? "replaced by a newer approved version" : "draft, not yet approved"}`}>
        <Link className="btn btn-inline btn-quiet" href="/contracts/templates">All templates</Link>
      </PageHead>

      {sp.approved && shown.status === "approved" && <p className="msg" role="status">Version {shown.version} approved. New agreements use it from now on; agreements already sent keep the wording they were sent with.</p>}
      {!shown.attorney_reviewed && <p className="msg warn">Not reviewed by an attorney. Points to review are marked in the preview and listed below.</p>}
      {shown.attorney_reviewed && <p className="msg">Recorded as reviewed by an attorney{shown.attorney_note ? `: ${shown.attorney_note}` : "."}</p>}

      <section className="panel">
        <h2>Versions</h2>
        <ul className="plain">
          {versions.map((v) => (
            <li key={v.id}>
              <Link className="link" href={`/contracts/templates/${key}?v=${v.version}`}>Version {v.version}</Link>{" "}
              <span className={`tag tag-sm ${v.status === "approved" ? "tone-good" : v.status === "draft" ? "tone-warn" : ""}`}>{v.status}</span>{" "}
              <span className="small">{v.approved_at ? `approved ${formatStudioTime(v.approved_at)}` : `saved ${formatStudioTime(v.updated_at)}`}{v.change_note ? ` · ${v.change_note}` : ""}</span>
            </li>
          ))}
        </ul>
        {me.isOwner && shown.status === "draft" && (
          <HubForm action={approveTemplate}>
            <input type="hidden" name="id" value={shown.id} />
            <label className="field"><input type="checkbox" name="confirm" /> I&apos;ve read version {shown.version} and approve it as BLEUSKM&apos;s {shown.name}{approved ? ` (it replaces version ${approved.version} for new agreements)` : ""}.</label>
            <Submit busy="Approving…">Approve version {shown.version}</Submit>
          </HubForm>
        )}
      </section>

      <section className="panel">
        <h2>Points for attorney review</h2>
        <ul>{shown.body.review.map((r, i) => <li key={i}>{r}</li>)}</ul>
        {me.isOwner && (
          <HubForm action={setAttorneyReview}>
            <input type="hidden" name="id" value={shown.id} />
            <label className="field"><input type="checkbox" name="reviewed" defaultChecked={shown.attorney_reviewed} /> An attorney has reviewed version {shown.version}</label>
            <label className="field"><span>Note (attorney, date, changes)</span><input name="note" defaultValue={shown.attorney_note ?? ""} maxLength={2000} /></label>
            <Submit>Save review status</Submit>
          </HubForm>
        )}
      </section>

      <section className="panel">
        <h2>Preview with sample details</h2>
        <p className="small">Shown exactly as a signer sees it. Gold italic text marks details that aren&apos;t known yet: the agreement says they&apos;ll be confirmed in writing rather than guessing.</p>
        <div style={{ background: "#080808", padding: "24px 8px" }}><AgreementView a={sample} reviewNotes={reviewNotes} banner="Preview · sample details" /></div>
      </section>

      {me.isOwner && (
        <section className="panel">
          <h2>Edit</h2>
          <p className="small">{shown.status === "draft" ? "Saving updates this draft." : `Saving creates version ${versions[0].version + (versions[0].status === "draft" ? 0 : 1)} as a draft; version ${shown.version} stays in use until you approve it.`} Each section starts with a line &ldquo;## Title&rdquo;. Use fields like {"{{role}}"} to fill in details. A line starting &ldquo;&gt; Attorney review:&rdquo; adds a review note to that section.</p>
          <HubForm action={saveTemplate}>
            <input type="hidden" name="key" value={key} />
            <label className="field"><span>Template name</span><input name="name" defaultValue={shown.name} maxLength={200} /></label>
            <label className="field"><span>Agreement title</span><input name="title" defaultValue={shown.body.title} maxLength={80} /></label>
            <label className="field"><span>Header label</span><input name="doc_label" defaultValue={shown.body.docLabel} maxLength={80} /></label>
            <label className="field"><span>Signer is called</span><input name="signer_label" defaultValue={shown.body.signerLabel} maxLength={60} /></label>
            <fieldset className="field wide"><span>Required before sending</span>
              {Object.entries(FIELDS).map(([k, f]) => (
                <label key={k} style={{ display: "inline-block", marginRight: 14 }}><input type="checkbox" name="required" value={k} defaultChecked={shown.body.required.includes(k)} /> {f.label}</label>
              ))}
            </fieldset>
            <label className="field wide"><span>Sections</span><textarea name="clauses" rows={30} defaultValue={clausesToText(shown.body.clauses)} /></label>
            <label className="field wide"><span>Attorney review points (one per line)</span><textarea name="review" rows={5} defaultValue={shown.body.review.join("\n")} /></label>
            <label className="field wide"><span>What changed (kept with the version)</span><input name="change_note" maxLength={1000} /></label>
            <p className="small wide">Available fields: {Object.keys(FIELDS).map((k) => `{{${k}}}`).join(" ")}</p>
            <Submit>Save</Submit>
          </HubForm>
        </section>
      )}
    </>
  );
}
