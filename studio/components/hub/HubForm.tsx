"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

type State = { error?: string; done?: string } | undefined;
type Counted = (State & { n?: number }) | undefined;

/** A form that runs a server action and shows its result above the fields. */
export function HubForm({
  action, children, className = "form-grid", confirm, resetOnDone,
}: {
  action: (s: State, f: FormData) => Promise<State>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  resetOnDone?: boolean;
}) {
  const [state, formAction] = useActionState(async (s: Counted, f: FormData): Promise<Counted> => {
    const r = await action(s, f);
    return { ...r, n: (s?.n ?? 0) + (r?.done ? 1 : 0) };
  }, undefined);
  return (
    <form
      action={formAction}
      className={className}
      key={resetOnDone ? state?.n ?? 0 : undefined}
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {state?.error && <p className="msg error wide" role="alert">{state.error}</p>}
      {state?.done && <p className="msg wide" role="status">{state.done}</p>}
      {children}
    </form>
  );
}

export function Submit({ children, busy = "Saving…", quiet }: { children: React.ReactNode; busy?: string; quiet?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={`btn btn-inline${quiet ? " btn-quiet" : ""}`} type="submit" disabled={pending}>
      {pending ? busy : children}
    </button>
  );
}
