"use client";

import { useActionState } from "react";
import { addDepartment } from "@/lib/hub/production-actions";
import { SubmitButton } from "@/components/SubmitButton";

export function DepartmentForm({ productionId }: { productionId: string }) {
  const [state, action] = useActionState(addDepartment, undefined);
  return (
    <form action={action} className="inline-form">
      <input type="hidden" name="production_id" value={productionId} />
      <label className="field"><span>New department</span><input name="name" maxLength={60} required /></label>
      <div><SubmitButton busy="Adding…">Add</SubmitButton></div>
      {state?.error && <p className="msg error" role="alert">{state.error}</p>}
    </form>
  );
}
