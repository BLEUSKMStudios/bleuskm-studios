"use client";

import { useActionState } from "react";
import { invitePerson } from "@/lib/hub/user-actions";
import { SubmitButton } from "@/components/SubmitButton";

export function InviteForm() {
  const [state, action] = useActionState(invitePerson, undefined);
  return (
    <form action={action}>
      {state?.error && <p className="msg error" role="alert">{state.error}</p>}
      {state?.done && <p className="msg" role="status">{state.done}</p>}
      <label className="field"><span>Name</span><input name="full_name" autoComplete="off" maxLength={120} required /></label>
      <label className="field"><span>Email</span><input name="email" type="email" autoComplete="off" required /></label>
      <SubmitButton busy="Sending…">Send invitation</SubmitButton>
    </form>
  );
}
