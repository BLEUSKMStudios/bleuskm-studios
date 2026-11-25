import { AuthCard } from "@/components/AuthCard";
import { inviteByToken, sharedDocLink } from "@/lib/hub/selftape-public";
import { formatStudioTime } from "@/lib/hub/casting-core";
import { MAX_SELFTAPE_FILES, maxSelftapeBytes } from "@/lib/hub/selftape";
import { SelftapeUploader } from "./SelftapeUploader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Send your self-tape · BLEUSKM Studios", robots: { index: false, follow: false } };

// The applicant's personal self-tape page. No account needed: the link itself
// is the key, and it shows only this person's invitation.
export default async function UploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await inviteByToken(token);
  if (!found) {
    return <AuthCard eyebrow="BLEUSKM STUDIOS" title="This link isn't valid" lead="It may have been replaced by a newer link. Check your most recent email from BLEUSKM Studios, or reply to it and we'll help." ><span /></AuthCard>;
  }
  const { admin, invite } = found;
  if (invite.status === "sent") {
    await admin.from("selftape_invitations").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", invite.id).eq("status", "sent");
  }
  if (invite.state === "cancelled" || invite.state === "expired") {
    return <AuthCard eyebrow="BLEUSKM STUDIOS" title="This link is closed" lead={invite.state === "expired" ? "The deadline for this self-tape has passed. If you need more time, reply to our email." : "This invitation was withdrawn or replaced by a newer link."}><span /></AuthCard>;
  }
  const [sides, treatment] = await Promise.all([
    sharedDocLink(admin, invite.sidesDocumentId, invite.productionId),
    sharedDocLink(admin, invite.treatmentDocumentId, invite.productionId),
  ]);
  const left = MAX_SELFTAPE_FILES - invite.files;
  return (
    <AuthCard eyebrow="BLEUSKM STUDIOS" title={`Self-tape for ${invite.film}`} lead={`Hi ${invite.firstName}. This is your personal page to send your self-tape for ${invite.role || "the role"}.`}>
      {invite.deadline && <p><strong>Deadline:</strong> {formatStudioTime(invite.deadline)}</p>}
      {invite.instructions && <div className="panel" style={{ whiteSpace: "pre-wrap" }}>{invite.instructions}</div>}
      {(invite.sidesUrl || sides || treatment) && (
        <ul className="plain">
          {invite.sidesUrl && <li><a className="link" href={invite.sidesUrl} target="_blank" rel="noopener noreferrer">Your sides</a></li>}
          {sides && <li><a className="link" href={sides.url} target="_blank" rel="noopener noreferrer">{sides.title} (sides)</a> <span className="small">link valid 1 hour</span></li>}
          {treatment && <li><a className="link" href={treatment.url} target="_blank" rel="noopener noreferrer">{treatment.title} (treatment)</a> <span className="small">link valid 1 hour</span></li>}
        </ul>
      )}
      {invite.files > 0 && <p className="msg" role="status">We have received {invite.files} {invite.files === 1 ? "file" : "files"} from you. Thank you.</p>}
      {left > 0 ? (
        <SelftapeUploader token={token} maxMb={Math.round(maxSelftapeBytes(process.env) / 1048576)} allowLinks={invite.allowLinks} left={left} />
      ) : <p className="small">You have sent the maximum number of files.</p>}
      <p className="small">Your files are stored privately and seen only by the BLEUSKM Studios casting team.</p>
    </AuthCard>
  );
}
