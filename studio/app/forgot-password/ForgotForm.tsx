"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/SubmitButton";

export function ForgotForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  if (state?.done) return <p className="msg" role="status">{state.done}</p>;
  return (
    <form action={action}>
      {state?.error && <p className="msg error" role="alert">{state.error}</p>}
      <label className="field"><span>Email</span><input name="email" type="email" autoComplete="username" required /></label>
      <SubmitButton busy="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
