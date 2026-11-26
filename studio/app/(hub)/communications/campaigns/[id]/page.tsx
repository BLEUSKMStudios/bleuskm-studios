import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbCheck, hubContext } from "@/lib/hub/data";
import { isUuid } from "@/lib/sections";
import { writeBlockReason } from "@/lib/hub/env";
import { toHtml } from "@/lib/hub/templates";
import { marketingAudiences } from "@/lib/campaigns/data";
import { CAMPAIGN_STATUS, campaignBlockReason, campaignFooter, personalize, postalAddress, unknownFields } from "@/lib/campaigns/rules";
import { approveCampaign, cancelCampaign, sendCampaign, sendCampaignTest, submitCampaign, withdrawCampaign } from "@/lib/campaigns/actions";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { ActionForm } from "@/components/hub/ActionForm";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { LocalTime } from "@/components/hub/LocalTime";
import { CampaignForm } from "@/components/campaigns/CampaignForm";

export const metadata = { title: "Campaign · BLEUSKM Studio OS" };

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const { me } = await hubContext();
  if (!me.isOwner && !(await dbCheck(null, "communications", "view"))) return <NoAccess what="campaigns" />;
  const { supabase } = await loadSession();
  const { data: c } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const canEdit = me.isOwner || (await dbCheck(null, "communications", "edit"));
  const blocked = writeBlockReason();
  const audiences = await marketingAudiences();
  const aud = audiences.find((a) => a.id === c.audience_id);
  const admin = createAdminClient();
  const { data: approver } = c.approved_by && admin ? await admin.from("profiles").select("full_name").eq("id", c.approved_by).maybeSingle() : { data: null };
  const { data: recips } = await supabase.from("campaign_recipients").select("status, unsubscribed_at, message_id").eq("campaign_id", id).limit(20000);
  const count = (s: string) => (recips ?? []).filter((r) => r.status === s).length;
  const unsubs = (recips ?? []).filter((r) => r.unsubscribed_at).length;
  const msgIds = (recips ?? []).map((r) => r.message_id).filter(Boolean) as string[];
  const { data: msgs } = msgIds.length ? await supabase.from("comm_messages").select("status, opened_at").in("id", msgIds.slice(0, 1000)) : { data: [] };
  const opened = (msgs ?? []).filter((m) => m.opened_at || m.status === "opened").length;
  const st = CAMPAIGN_STATUS[c.status as string] ?? { label: c.status, tone: "info" };
  const sample = { name: me.fullName };
  const footer = campaignFooter({ audience: aud?.name ?? "our updates", address: postalAddress(process.env) || "[studio mailing address: add STUDIO_POSTAL_ADDRESS]", unsubscribeUrl: "https://studio.bleuskm.com/u/…" });
  const html = toHtml(personalize(c.body as string, sample) + "\n" + footer, { from: `${c.identity_key}@bleuskm.com`, preview: c.preview_text as string | null, unsubscribeUrl: "#" });
  const bad = unknownFields(`${c.subject}\n${c.preview_text ?? ""}\n${c.body}`);
  const off = campaignBlockReason(process.env);
  const live = !blocked && canEdit;

  return (
    <>
      <PageHead title={c.name as string} lead={<><span className={`tag tone-${st.tone}`}>{st.label}</span> · {aud?.name ?? "Audience"} · from {c.identity_key as string}@bleuskm.com</>}>
        <Link className="btn btn-inline btn-quiet" href="/communications?tab=campaigns">All campaigns</Link>
      </PageHead>
      {sp.created && <p className="msg" role="status">Draft created. Send yourself a test, then submit it for approval.</p>}
      {blocked && <p className="msg warn">{blocked}</p>}
      {bad.length > 0 && <p className="msg warn">The wording has fields Studio OS can&apos;t fill: {bad.map((b) => `{{${b}}}`).join(", ")}. Only {"{{first_name}}"} and {"{{name}}"} work.</p>}

      <section className="panel">
        <h2>Where it stands</h2>
        <dl className="facts">
          <dt>Goes to</dt><dd>{aud ? `${aud.name}: ${aud.eligible} ${aud.eligible === 1 ? "person" : "people"} subscribed with a deliverable address right now` : "—"}</dd>
          <dt>Test email</dt><dd>{c.test_sent_at ? <>Sent to {c.test_sent_to as string} <LocalTime iso={c.test_sent_at as string} /></> : "Not sent yet"}</dd>
          <dt>Approval</dt><dd>{c.approved_at ? <>Approved by {(approver?.full_name as string) ?? "the owner"} <LocalTime iso={c.approved_at as string} /> (this exact wording)</> : c.status === "submitted" ? "Waiting for the owner" : "Not approved"}</dd>
          {c.status === "sending" || c.status === "sent" ? <><dt>Sending</dt><dd>{count("sent")} sent of {c.recipient_count as number}{count("queued") ? ` · ${count("queued")} still to send` : ""}{count("failed") + count("blocked") ? ` · ${count("failed") + count("blocked")} not sent` : ""}{count("skipped") ? ` · ${count("skipped")} skipped` : ""}</dd></> : null}
          {c.status === "sent" || c.status === "sending" ? <><dt>Results</dt><dd>{opened} opened · {unsubs} unsubscribed</dd></> : null}
          {c.sent_at ? <><dt>Finished</dt><dd><LocalTime iso={c.sent_at as string} /></dd></> : null}
        </dl>

        {live && (
          <div className="row-actions">
            {["draft", "submitted", "approved"].includes(c.status as string) && <ActionForm action={sendCampaignTest} fields={{ id }} label="Send me a test" busy="Sending…" quiet />}
            {c.status === "draft" && <ActionForm action={submitCampaign} fields={{ id }} label="Submit for approval" busy="Submitting…" />}
            {(c.status === "submitted" || c.status === "approved") && <ActionForm action={withdrawCampaign} fields={{ id }} label="Back to draft" busy="Working…" quiet />}
            {!["sent", "cancelled"].includes(c.status as string) && <ActionForm action={cancelCampaign} fields={{ id }} label="Cancel campaign" busy="Cancelling…" quiet confirm="Cancel this campaign? Nothing more will be sent." />}
          </div>
        )}
      </section>

      {live && c.status === "submitted" && me.isOwner && (
        <section className="panel narrow">
          <h2>Approve</h2>
          <p className="small">You&apos;re approving this exact subject, wording, sender and audience. Any later edit withdraws the approval.</p>
          <HubForm action={approveCampaign}>
            <input type="hidden" name="id" value={id} />
            <label className="check wide"><input type="checkbox" name="confirm" /> <span>I&apos;ve read the preview below and approve it.</span></label>
            <Submit busy="Approving…">Approve campaign</Submit>
          </HubForm>
        </section>
      )}
      {live && c.status === "submitted" && !me.isOwner && <p className="msg">Submitted. The owner approves it before it can be sent.</p>}

      {live && (c.status === "approved" || c.status === "sending") && (
        <section className="panel narrow">
          <h2>{c.status === "sending" ? "Continue sending" : "Send"}</h2>
          {off ? <p className="msg warn">{off}</p> : (
            <HubForm action={sendCampaign}>
              <input type="hidden" name="id" value={id} />
              <label className="check wide"><input type="checkbox" name="confirm" /> <span>{c.status === "sending" ? `Send the next batch (up to 250).` : `Send to the ${aud?.eligible ?? 0} people subscribed to ${aud?.name ?? "this audience"} now.`}</span></label>
              <Submit busy="Sending…">{c.status === "sending" ? "Continue sending" : "Send campaign"}</Submit>
            </HubForm>
          )}
        </section>
      )}

      <section className="panel">
        <h2>Preview</h2>
        <p className="small"><strong>Subject:</strong> {personalize(c.subject as string, sample)}{c.preview_text ? <> · <strong>Preview:</strong> {c.preview_text as string}</> : null}</p>
        <iframe title="Email preview" srcDoc={html} sandbox="" style={{ width: "100%", height: 520, border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} />
      </section>

      {live && c.status !== "sending" && c.status !== "sent" && c.status !== "cancelled" && (
        <section className="panel">
          <h2>Edit</h2>
          {c.status !== "draft" && <p className="msg warn">Saving changes sends it back to draft; it needs approval again.</p>}
          <CampaignForm audiences={audiences} values={c} />
        </section>
      )}
    </>
  );
}
