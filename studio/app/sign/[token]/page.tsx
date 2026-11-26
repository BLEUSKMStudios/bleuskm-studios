import { headers } from "next/headers";
import "@/components/contracts/agreement.css";
import { AgreementView } from "@/components/contracts/AgreementView";
import { agreementByToken, logEvent, requestMeta } from "@/lib/contracts/public";
import { AGREE_TEXT, CONSENT_TEXT, maskEmail } from "@/lib/contracts/render";
import { formatStudioTime } from "@/lib/hub/casting-core";
import { SignForm } from "./SignForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review and sign · BLEUSKM Studios", robots: { index: false, follow: false } };

function Closed({ title, body }: { title: string; body: string }) {
  return (
    <main className="ag-page"><div className="ag"><div className="ag-done">
      <p className="ag-step">BLEUSKM Studios</p><h1>{title}</h1><p>{body}</p>
    </div></div></main>
  );
}

// The signer's personal page. No account: the link is the key, and signing
// also needs a one-time code sent to the signer's email.
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await agreementByToken(token);
  if (!ctx) return <Closed title="This link isn't valid" body="It may have been replaced by a newer link. Check your most recent email from BLEUSKM Studios, or reply to it and we'll help." />;
  const { admin, r, agreement, state } = ctx;
  if (state === "signed") return <Closed title="Already signed" body="This agreement has been signed. Your signed copy was emailed to you as a PDF. If you need another copy, reply to our email." />;
  if (state === "expired") return <Closed title="This link has expired" body="Reply to our email and we'll send you a fresh link." />;
  if (state === "voided" || state === "declined") return <Closed title="This agreement was withdrawn" body="BLEUSKM Studios has withdrawn this agreement. If you have questions, reply to our email." />;
  if (!agreement) return <Closed title="This agreement can't be shown" body="Something is wrong with this copy, so it can't be signed. Please reply to our email and we'll send a fresh one." />;
  if (r.status === "sent") {
    const meta = requestMeta(await headers());
    const { data } = await admin.from("contract_requests").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", r.id).eq("status", "sent").select("id");
    if (data?.length) await logEvent(admin, r.id, "opened", meta);
  }
  return (
    <main className="ag-page">
      <AgreementView a={agreement} studioSig={{ name: agreement.studio.name, title: agreement.studio.title, date: r.approved_at ? `Approved ${formatStudioTime(r.approved_at)}` : null }}>
        <SignForm token={token} name={r.signer_name} email={maskEmail(r.signer_email)} contentHash={r.content_hash!} consent={CONSENT_TEXT} agree={AGREE_TEXT}
          expires={r.expires_at ? formatStudioTime(r.expires_at) : null} />
      </AgreementView>
    </main>
  );
}
