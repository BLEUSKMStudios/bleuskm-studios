"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/hub/user-actions";
import { SubmitButton } from "@/components/SubmitButton";

export function CopyFrom({ action, userId, people }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; userId: string; people: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="inline-form">
      <input type="hidden" name="user_id" value={userId} />
      <label className="field"><span>Copy from</span>
        <select name="from_user_id" required defaultValue="">
          <option value="" disabled>Choose a person…</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <div><SubmitButton busy="Copying…">Copy access</SubmitButton></div>
      {state?.error && <p className="msg error" role="alert">{state.error}</p>}
      {state?.done && <p className="msg" role="status">{state.done}</p>}
    </form>
  );
}
