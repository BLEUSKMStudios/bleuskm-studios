"use client";

import { useState } from "react";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { SendId } from "@/components/hub/SendId";
import { fillTemplate, missingFields, type TemplateVars } from "@/lib/hub/casting-core";

type T = { id: string; name: string; subject: string; body: string; sets_status: string | null };
type State = { error?: string; done?: string } | undefined;

/** Pick a template, edit it for this person, preview it filled in, and send. */
export function EmailComposer({ action, templates, vars, applicationId, productionId, statusLabels, from }: {
  action: (s: State, f: FormData) => Promise<State>;
  templates: T[];
  vars: TemplateVars;
  applicationId: string;
  productionId: string;
  statusLabels: Record<string, string>;
  from: string;
}) {
  const [tid, setTid] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const t = templates.find((x) => x.id === tid);
  const pick = (id: string) => {
    setTid(id);
    const x = templates.find((y) => y.id === id);
    setSubject(x?.subject ?? "");
    setBody(x?.body ?? "");
  };
  const missing = missingFields(subject + "\n" + body, vars);
  return (
    <HubForm action={action} className="action-form" confirm="Send this email now?">
      <SendId />
      <input type="hidden" name="ids" value={applicationId} />
      <input type="hidden" name="production_id" value={productionId} />
      <input type="hidden" name="template_id" value={tid} />
      <label className="field"><span>Template</span>
        <select value={tid} onChange={(e) => pick(e.target.value)}>
          <option value="">Write my own…</option>
          {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <label className="field"><span>Subject</span><input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required /></label>
      <label className="field"><span>Message</span><textarea name="body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} required /></label>
      {missing.length > 0 && <p className="msg error">No value yet for: {missing.join(", ")}. {missing.some((m) => m.startsWith("session")) ? "Add a scheduled session first, or edit the text." : "Edit the text before sending."}</p>}
      {t?.sets_status && <label className="small"><input type="checkbox" name="apply_status" defaultChecked /> Also set status to {statusLabels[t.sets_status] ?? t.sets_status}</label>}
      {(subject || body) && (
        <div className="preview">
          <p className="small">Preview</p>
          <p><strong>{fillTemplate(subject, vars)}</strong></p>
          <div style={{ whiteSpace: "pre-wrap" }}>{fillTemplate(body, vars)}</div>
        </div>
      )}
      <div><Submit busy="Sending…">Send from {from}</Submit></div>
    </HubForm>
  );
}
