"use client";

import { useActionState } from "react";
import { signIn } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/SubmitButton";

export function LoginForm() {
  const [state, action] = useActionState(signIn, undefined);
  return (
    <form action={action}>
      {state?.error && <p className="msg error" role="alert">{state.error}</p>}
      <label className="field"><span>Email</span><input name="email" type="email" autoComplete="username" required /></label>
      <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
      <SubmitButton busy="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
