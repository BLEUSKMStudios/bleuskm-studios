import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { loadSession } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · BLEUSKM Studio OS" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { decision } = await loadSession();
  if (decision.kind !== "sign-in" && decision.kind !== "blocked") redirect("/");
  const { reason } = await searchParams;
  return (
    <AuthCard title="Sign in" lead="Studio OS is invitation only.">
      {reason === "blocked" && <p className="msg error">This account doesn't have access to Studio OS. Contact the studio owner.</p>}
      {reason === "signed-out" && <p className="msg">You're signed out.</p>}
      {reason === "link-expired" && <p className="msg error">That link has expired or was already used. Ask for a new one.</p>}
      <LoginForm />
      <p className="small" style={{ marginTop: 16 }}>
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
    </AuthCard>
  );
}
