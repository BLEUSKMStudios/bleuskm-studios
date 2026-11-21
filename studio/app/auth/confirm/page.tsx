import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { SubmitButton } from "@/components/SubmitButton";
import { readEmailLink } from "@/lib/auth/link";
import { acceptEmailLink } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Continue · BLEUSKM Studio OS", robots: { index: false } };

const COPY = {
  invite: { title: "Accept your invitation", lead: "Press Continue to set up your account.", button: "Continue" },
  recovery: { title: "Reset your password", lead: "Press Continue to choose a new password.", button: "Continue" },
  email_change: { title: "Confirm your new email", lead: "Press Continue to confirm the change.", button: "Continue" },
} as const;

// Landing page for invitation and reset emails. Opening it uses nothing: the
// one-time link is only spent when the person presses Continue (a POST).
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const link = readEmailLink(await searchParams);
  if (link.kind === "invalid") {
    return (
      <AuthCard title="This link doesn't work" lead="It may be incomplete. Open the newest email we sent, or ask for a new link.">
        <p className="small"><Link href="/login">Back to sign in</Link></p>
      </AuthCard>
    );
  }
  const copy = link.kind === "token" ? COPY[link.type as keyof typeof COPY] : COPY.invite;
  return (
    <AuthCard title={copy.title} lead={copy.lead}>
      <form action={acceptEmailLink}>
        {link.kind === "token" ? (
          <>
            <input type="hidden" name="token_hash" value={link.tokenHash} />
            <input type="hidden" name="type" value={link.type} />
          </>
        ) : (
          <input type="hidden" name="code" value={link.code} />
        )}
        <input type="hidden" name="next" value={link.next} />
        <SubmitButton busy="One moment…">{copy.button}</SubmitButton>
      </form>
    </AuthCard>
  );
}
