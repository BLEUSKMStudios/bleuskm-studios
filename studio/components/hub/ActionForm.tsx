"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/hub/user-actions";

/** A one-button form that runs a server action and shows its result. */
export function ActionForm({
  action, fields, label, busy, quiet, confirm,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  busy: string;
  quiet?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      className="action-form"
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button className={`btn btn-inline${quiet ? " btn-quiet" : ""}`} type="submit" disabled={pending}>{pending ? busy : label}</button>
      {state?.error && <p className="msg error" role="alert">{state.error}</p>}
      {state?.done && <p className="msg" role="status">{state.done}</p>}
    </form>
  );
}
