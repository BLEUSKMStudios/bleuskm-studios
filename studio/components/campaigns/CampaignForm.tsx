import { saveCampaign } from "@/lib/campaigns/actions";
import { HubForm, Submit } from "@/components/hub/HubForm";

export type AudienceOption = { id: string; name: string; eligible: number };

/** The campaign editor (drafts only). */
export function CampaignForm({ audiences, values }: { audiences: AudienceOption[]; values?: Record<string, unknown> }) {
  const v = (k: string) => (values?.[k] as string | null | undefined) ?? "";
  return (
    <HubForm action={saveCampaign}>
      {values?.id ? <input type="hidden" name="id" value={String(values.id)} /> : null}
      <label className="field"><span>Name (only you see it) <em className="req">*</em></span><input name="name" defaultValue={v("name")} required maxLength={200} /></label>
      <label className="field"><span>Goes to <em className="req">*</em></span>
        <select name="audience_id" defaultValue={v("audience_id") || audiences[0]?.id}>
          {audiences.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.eligible} subscribed)</option>)}
        </select>
        <span className="hint">Only people who opted in. Applicants and inquiries are never campaign audiences.</span>
      </label>
      <label className="field"><span>From</span>
        <select name="identity_key" defaultValue={v("identity_key") || "newsletter"}>
          <option value="newsletter">newsletter@bleuskm.com</option>
          <option value="films">films@bleuskm.com</option>
          <option value="studio">studio@bleuskm.com</option>
        </select>
      </label>
      <label className="field"><span>Subject <em className="req">*</em></span><input name="subject" defaultValue={v("subject")} required maxLength={300} /></label>
      <label className="field wide"><span>Preview text (shown after the subject in most inboxes)</span><input name="preview_text" defaultValue={v("preview_text")} maxLength={300} /></label>
      <label className="field wide"><span>Email <em className="req">*</em></span>
        <textarea name="body" rows={14} defaultValue={v("body")} required maxLength={50000} placeholder={"Hi {{first_name}},\n\n…"} />
        <span className="hint">Plain text: a blank line starts a new paragraph, and links are made clickable. {"{{first_name}}"} and {"{{name}}"} are filled in for each person. The unsubscribe link and the studio address are added automatically.</span>
      </label>
      <div className="wide form-actions"><Submit>{values?.id ? "Save draft" : "Create draft"}</Submit></div>
    </HubForm>
  );
}
