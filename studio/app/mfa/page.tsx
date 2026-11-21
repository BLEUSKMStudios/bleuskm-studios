import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { loadSession } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/decide";
import { VerifyAuthenticator } from "./VerifyAuthenticator";

export const dynamic = "force-dynamic";
export const metadata = { title: "Two-step sign-in · BLEUSKM Studio OS" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { decision } = await loadSession();
  if (decision.kind === "sign-in") redirect("/login");
  if (decision.kind === "blocked") redirect("/auth/signout?reason=blocked");
  if (decision.kind === "set-up-authenticator") redirect("/mfa/setup");
  const next = safeNextPath((await searchParams).next);
  if (decision.kind === "allow") redirect(next);
  return (
    <AuthCard title="Two-step sign-in" lead="Enter the 6-digit code from your authenticator app.">
      <VerifyAuthenticator next={next} />
      <form action="/auth/signout" method="post" style={{ marginTop: 12 }}>
        <button className="btn btn-quiet" type="submit">Cancel and sign out</button>
      </form>
    </AuthCard>
  );
}
