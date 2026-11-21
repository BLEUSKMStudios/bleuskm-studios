import Link from "next/link";
import { isOwnerHere } from "@/lib/hub/owner";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { InviteForm } from "./InviteForm";

export const metadata = { title: "Invite someone · BLEUSKM Studio OS" };

export default async function InvitePage() {
  if (!(await isOwnerHere())) return <NoAccess what="Settings" />;
  return (
    <>
      <PageHead title="Invite someone" lead={<><Link className="link" href="/settings/users">User Access</Link> · They'll get an email to choose a password, and start with no access until you grant it.</>} />
      <section className="panel narrow"><InviteForm /></section>
    </>
  );
}
