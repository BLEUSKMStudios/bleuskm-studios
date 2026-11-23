"use client";

import { HubForm, Submit } from "@/components/hub/HubForm";
import { saveModuleRecord } from "@/lib/hub/module-actions";
import type { Field } from "@/lib/hub/modules";

export type ScopeOption = { value: string; label: string };

function Input({ f, value }: { f: Field; value: string }) {
  const common = { name: f.name, defaultValue: value, required: f.required, "aria-describedby": f.help ? `${f.name}-help` : undefined };
  switch (f.type) {
    case "textarea":
      return <textarea {...common} rows={f.max && f.max > 2000 ? 5 : 3} maxLength={f.max} />;
    case "select":
      return (
        <select {...common}>
          {!f.required && !f.initial && <option value="">—</option>}
          {f.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      );
    case "date": return <input {...common} type="date" />;
    case "time": return <input {...common} type="time" />;
    case "url": return <input {...common} type="url" inputMode="url" placeholder="https://" maxLength={f.max} />;
    case "email": return <input {...common} type="email" inputMode="email" maxLength={f.max} />;
    case "phone": return <input {...common} type="tel" inputMode="tel" maxLength={f.max} />;
    case "number": return <input {...common} type="number" />;
    default: return <input {...common} type="text" maxLength={f.max} />;
  }
}

/** Add or edit form for any module record, built from the module's fields. */
export function RecordForm({
  module, fields, values, id, scopes, scope, parentId, submitLabel, resetOnDone,
}: {
  module: string;
  fields: readonly Field[];
  values?: Record<string, unknown>;
  id?: string;
  scopes?: ScopeOption[];          // where it may be saved (production ids, "" = Studio level)
  scope?: string;                   // fixed production id
  parentId?: string;
  submitLabel: string;
  resetOnDone?: boolean;
}) {
  const val = (f: Field) => {
    const v = values?.[f.name];
    if (v === null || v === undefined) return values ? "" : f.initial ?? "";
    const s = String(v);
    return f.type === "time" ? s.slice(0, 5) : s;
  };
  return (
    <HubForm action={saveModuleRecord} resetOnDone={resetOnDone}>
      <input type="hidden" name="module" value={module} />
      {id && <input type="hidden" name="id" value={id} />}
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}
      {scope !== undefined && <input type="hidden" name="production_id" value={scope} />}
      {scope === undefined && scopes && (
        <label className="field wide">
          <span>Production</span>
          <select name="production_id" defaultValue={(values?.production_id as string | null) ?? scopes[0]?.value ?? ""}>
            {scopes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      )}
      {fields.map((f) => (
        <label key={f.name} className={`field${f.wide || f.type === "textarea" ? " wide" : ""}`}>
          <span>{f.label}{f.required && <em className="req" aria-hidden="true"> *</em>}</span>
          <Input f={f} value={val(f)} />
          {f.help && <small id={`${f.name}-help`} className="hint">{f.help}</small>}
        </label>
      ))}
      <div className="wide form-actions"><Submit>{submitLabel}</Submit></div>
    </HubForm>
  );
}
