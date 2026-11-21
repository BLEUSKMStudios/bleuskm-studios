"use client";

import { useActionState } from "react";
import { setPassword } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/SubmitButton";

export function SetPasswordForm() {
  const [state, action] = useActionState(setPassword, undefined);
  return (
    <form action={action}>
      {state?.error && <p className="msg error" role="alert">{state.error}</p>}
      <label className="field"><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
      <label className="field"><span>Type it again</span><input name="confirm" type="password" autoComplete="new-password" minLength={12} required /></label>
      <SubmitButton busy="Saving…">Save password</SubmitButton>
    </form>
  );
}
