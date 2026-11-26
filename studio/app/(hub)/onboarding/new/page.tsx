import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext, dbCheck } from "@/lib/hub/data";
import { isUuid } from "@/lib/sections";
import { prefill } from "@/lib/contracts/data";
import { SHAREABLE } from "@/lib/hub/doc-files";
import { sendOnboarding } from "@/lib/hub/onboarding-actions";
import { writeBlockReason } from "@/lib/hub/env";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { HubForm, Submit } from "@/components/hub/HubForm";

export const metadata = { title: "Send materials" };

const KIND: Record<string, string> = {
  script: "Script", sides: "Sides", treatment: "Treatment", schedule: "Schedule", rehearsal: "Rehearsal schedule",
  call_sheet: "Call sheet", location_info: "Location & parking", guide: "Guide", report: "Report", other: "Other",
};

// Sends one person their production materials (scripts, sides, call sheets,
// guides…) through a personal link, from their profile.
export default async function NewOnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { me, productions } = await hubContext();
  const q = {
    application: isUuid(sp.application ?? "") ? sp.application : undefined,
    team: isUuid(sp.team ?? "") ? sp.team : undefined,
    contact: isUuid(sp.contact ?? "") ? sp.contact : undefined,
    production: isUuid(sp.production ?? "") ? sp.production : undefined,
  };
  const { supabase } = await loadSession();
  if (!q.production && !q.application && !q.team) {
    return (
      <>
        <PageHead title="Send materials" lead="Which production are these materials for?" />
        <section className="panel narrow">
          <form action="/onboarding/new" className="inline-form">
            {q.contact && <input type="hidden" name="contact" value={q.contact} />}
            <label className="field"><span>Production</span><select name="production">{productions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
            <button className="btn btn-inline" type="submit">Continue</button>
          </form>
        </section>
      </>
    );
  }
  const pre = await prefill(supabase, q, me);
  if (!pre) return <NoAccess what="this person or production" />;
  if (!(await dbCheck(pre.productionId, "documents", "edit"))) return <NoAccess what="sending materials on this production (Documents edit access)" />;
  const { data: docs } = await supabase.from("documents").select("id, title, category, version, storage_path, drive_url, supersedes_id")
    .eq("production_id", pre.productionId).in("category", [...SHAREABLE]).order("category").order("title").limit(300);
  // Only the latest version of each document, and only ones with a file or link.
  const replaced = new Set((docs ?? []).map((d) => d.supersedes_id as string | null).filter(Boolean));
  const usable = (docs ?? []).filter((d) => !replaced.has(d.id as string) && (d.storage_path || d.drive_url));
  const identity = pre.crew === true ? "crew" : pre.crew === false ? "casting" : "studio";
  const blocked = writeBlockReason();

  return (
    <>
      <PageHead title="Send materials" lead={`${pre.signerName || "New recipient"} · ${pre.productionTitle}${pre.role ? ` · ${pre.role}` : ""}`}>
        <Link className="btn btn-inline btn-quiet" href="/documents">Documents</Link>
      </PageHead>
      {blocked && <p className="msg warn">{blocked}</p>}
      <section className="panel">
        <p className="small">The person gets one email with a personal link to these documents. Studio OS records when each file is first opened and when they confirm receiving everything. Contracts, releases, permits and insurance are never shared this way.</p>
        {!usable.length ? (
          <p className="msg warn">This production has no shareable documents with a file or link yet. <Link className="link" href="/documents/new">Add a document</Link> (script, sides, call sheet, guide, location and parking…) first.</p>
        ) : (
          <HubForm action={sendOnboarding} confirm="Send this email now?">
            <input type="hidden" name="production_id" value={pre.productionId} />
            {pre.applicationId && <input type="hidden" name="application_id" value={pre.applicationId} />}
            {pre.teamId && <input type="hidden" name="team_id" value={pre.teamId} />}
            {pre.contactId && <input type="hidden" name="contact_id" value={pre.contactId} />}
            <label className="field"><span>Name <em className="req">*</em></span><input name="recipient_name" defaultValue={pre.signerName} required maxLength={200} /></label>
            <label className="field"><span>Email <em className="req">*</em></span><input type="email" name="recipient_email" defaultValue={pre.signerEmail} required maxLength={254} /></label>
            <label className="field"><span>From</span>
              <select name="identity" defaultValue={identity}>
                <option value="casting">casting@bleuskm.com</option>
                <option value="crew">crew@bleuskm.com</option>
                <option value="studio">studio@bleuskm.com</option>
              </select>
            </label>
            <label className="field"><span>Subject</span><input name="subject" defaultValue={`Your materials for ${pre.productionTitle}`} maxLength={300} /></label>
            <fieldset className="field wide">
              <legend>Documents <em className="req">*</em></legend>
              {usable.map((d) => (
                <label key={d.id as string} className="check">
                  <input type="checkbox" name="document_id" value={d.id as string} />
                  <span>{d.title as string} <span className="small">· {KIND[d.category as string] ?? d.category} · v{String(d.version ?? 1)}{d.storage_path ? "" : " · Drive link"}</span></span>
                </label>
              ))}
            </fieldset>
            <label className="field wide"><span>Message</span><textarea name="message" rows={5} maxLength={20000} placeholder={`Here are your production materials for ${pre.productionTitle}.`} /></label>
            <label className="check wide"><input type="checkbox" name="require_ack" defaultChecked /> <span>Ask them to confirm they received everything</span></label>
            <Submit busy="Sending…">Send materials</Submit>
          </HubForm>
        )}
      </section>
    </>
  );
}
