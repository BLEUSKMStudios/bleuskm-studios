import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { loadSession } from "@/lib/auth/session";
import { EnrollAuthenticator } from "./EnrollAuthenticator";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up two-step sign-in · BLEUSKM Studio OS" };

export default async function MfaSetupPage() {
  const { decision } = await loadSession();
  if (decision.kind === "sign-in") redirect("/login");
  if (decision.kind === "blocked") redirect("/auth/signout?reason=blocked");
  if (decision.kind === "verify-authenticator") redirect("/mfa");
  if (decision.kind === "allow") redirect("/"); // already set up, or not required
  return (
    <AuthCard
      title="Set up two-step sign-in"
      lead="The owner account needs an authenticator app, such as Google Authenticator, Microsoft Authenticator or 1Password."
    >
      <EnrollAuthenticator />
    </AuthCard>
  );
}
