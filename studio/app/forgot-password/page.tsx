import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { ForgotForm } from "./ForgotForm";

export const metadata = { title: "Reset password · BLEUSKM Studio OS" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" lead="We'll email you a link to choose a new password.">
      <ForgotForm />
      <p className="small" style={{ marginTop: 16 }}><Link href="/login">Back to sign in</Link></p>
    </AuthCard>
  );
}
