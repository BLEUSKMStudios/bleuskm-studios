import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { requireOwner } from "@/lib/auth/session";
import { InviteForm } from "./InviteForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invite someone · BLEUSKM Studio OS" };

export default async function InvitePage() {
  await requireOwner();
  return (
    <AuthCard title="Invite someone" lead="They'll get an email to choose a password. They start with no access until you grant it.">
      <InviteForm />
      <p className="small" style={{ marginTop: 16 }}><Link href="/">Back</Link></p>
    </AuthCard>
  );
}
