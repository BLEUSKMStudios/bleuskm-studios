import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext } from "@/lib/hub/data";
import { holdsSection } from "@/lib/hub/nav";
import { formatStudioTime } from "@/lib/hub/casting-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { SIGNATURE_BUCKET, STUDIO_SIGNATURE_PATH, byKey, ensureLibrary, loadTemplates } from "@/lib/contracts/data";
import { removeStudioSignature, seedLibrary, uploadStudioSignature } from "@/lib/contracts/actions";
import { writeBlockReason } from "@/lib/hub/env";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { ActionForm } from "@/components/hub/ActionForm";
import { HubForm, Submit } from "@/components/hub/HubForm";

export const metadata = { title: "Agreement templates" };
const AUDIENCE: Record<string, string> = { cast: "Cast", crew: "Crew", other: "Releases & other" };

export default async function TemplatesPage() {
  const { me, grants } = await hubContext();
  if (!me.isOwner && !holdsSection(grants, "documents")) return <NoAccess what="agreement templates" />;
  const { supabase } = await loadSession();
  // The owner's library starts with the BLEUSKM drafts.
  if (me.isOwner && !writeBlockReason()) await ensureLibrary(supabase);
  const groups = byKey(await loadTemplates(supabase));
  let signatureUrl: string | null = null;
  if (me.isOwner) {
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin.storage.from(SIGNATURE_BUCKET).createSignedUrl(STUDIO_SIGNATURE_PATH, 300);
      signatureUrl = data?.signedUrl ?? null;
    }
  }
  return (
    <>
      <PageHead title="Agreement templates" lead="BLEUSKM's master agreements. The owner approves each one once; every agreement sent afterwards uses the approved wording, frozen at the moment it's sent.">
        <Link className="btn btn-inline btn-quiet" href="/contracts">All agreements</Link>
      </PageHead>
      <p className="msg warn">These templates are drafts prepared in Studio OS from your existing actor agreement. None has been reviewed by an attorney. Each one lists the points an attorney should look at (unpaid work, worker classification, minors, liability releases, rights ownership and unions). Don&apos;t treat any template as legally approved until that review is recorded on it.</p>
      <section className="panel">
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Template</th><th>For</th><th>Approved version</th><th>Newest version</th><th>Attorney review</th></tr></thead>
          <tbody>
            {groups.map(({ key, latest, approved }) => (
              <tr key={key}>
                <th><Link href={`/contracts/templates/${key}`}>{latest.name}</Link></th>
                <td>{AUDIENCE[latest.audience]}</td>
                <td>{approved ? <><span className="tag tone-good">v{approved.version}</span> <span className="small">{formatStudioTime(approved.approved_at)}</span></> : <span className="tag tone-warn">Not approved</span>}</td>
                <td>v{latest.version} {latest.status === "draft" && <span className="small">draft</span>}</td>
                <td>{(approved ?? latest).attorney_reviewed ? <span className="tag tone-good">Reviewed</span> : <span className="tag tone-bad">Not reviewed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {me.isOwner && groups.length < 11 && <ActionForm action={seedLibrary} fields={{}} label="Add the BLEUSKM templates" busy="Adding…" />}
      </section>
      {me.isOwner && (
        <section className="panel narrow">
          <h2>Your signature on agreements</h2>
          <p className="small">Optional. Upload a PNG of your signature (transparent background works best). It&apos;s stored privately, never on the website, and applied only to agreements you approve when you tick &ldquo;use my signature&rdquo;. Otherwise your typed name is used. The old signature image on the public website isn&apos;t used.</p>
          {signatureUrl && <p><img src={signatureUrl} alt="Your signature on file" style={{ maxHeight: 60, background: "#fff", padding: 6, borderRadius: 4 }} /></p>}
          <HubForm action={uploadStudioSignature}>
            <label className="field"><span>Signature image (PNG, under 300 KB)</span><input type="file" name="file" accept="image/png" required /></label>
            <Submit busy="Uploading…">{signatureUrl ? "Replace signature" : "Upload signature"}</Submit>
          </HubForm>
          {signatureUrl && <ActionForm action={removeStudioSignature} fields={{}} label="Remove" busy="Removing…" quiet confirm="Remove your signature image?" />}
        </section>
      )}
    </>
  );
}
