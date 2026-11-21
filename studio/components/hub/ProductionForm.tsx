"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { PRODUCTION_STATUSES, PRODUCTION_TYPES, STAGES, STAGE_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/hub/labels";
import type { ActionState } from "@/lib/hub/production-actions";

type Values = { id?: string; title?: string; type?: string; status?: string; current_stage?: string; start_date?: string | null; end_date?: string | null };

export function ProductionForm({ action, values = {}, submit }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; values?: Values; submit: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="form-grid">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {state?.error && <p className="msg error wide" role="alert">{state.error}</p>}
      {state?.done && <p className="msg wide" role="status">{state.done}</p>}
      <label className="field wide"><span>Title</span><input name="title" defaultValue={values.title} maxLength={120} required /></label>
      <label className="field"><span>Type</span>
        <select name="type" defaultValue={values.type ?? ""} required>
          <option value="" disabled>Choose…</option>
          {PRODUCTION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </label>
      <label className="field"><span>Status</span>
        <select name="status" defaultValue={values.status ?? "planning"}>
          {PRODUCTION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <label className="field"><span>Current stage</span>
        <select name="current_stage" defaultValue={values.current_stage ?? "development"}>
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>
      </label>
      <label className="field"><span>Start date (optional)</span><input type="date" name="start_date" defaultValue={values.start_date ?? ""} /></label>
      <label className="field"><span>End date (optional)</span><input type="date" name="end_date" defaultValue={values.end_date ?? ""} /></label>
      <div className="wide"><SubmitButton busy="Saving…">{submit}</SubmitButton></div>
    </form>
  );
}
