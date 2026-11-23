import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { loadSession } from "@/lib/auth/session";
import { SetPasswordForm } from "./SetPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a password · BLEUSKM Studio OS" };

// Reached from an invitation or reset email (the link signs the person in).
export default async function SetPasswordPage() {
  const { decision } = await loadSession();
  if (decision.kind === "sign-in") redirect("/login");
  if (decision.kind === "blocked") redirect("/auth/signout?reason=blocked");
  if (decision.kind === "verify-authenticator") redirect("/mfa?next=/set-password");
  return (
    <AuthCard title="Choose a password" lead="At least 12 characters. A short sentence works well.">
      <SetPasswordForm />
    </AuthCard>
  );
}
