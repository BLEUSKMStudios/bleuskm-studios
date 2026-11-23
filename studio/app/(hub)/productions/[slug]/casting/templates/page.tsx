import Link from "next/link";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { saveTemplate } from "@/lib/hub/casting-actions";
import { castingAccess, templatesFor, type Template } from "@/lib/hub/casting-data";
import { APP_STATUSES, APP_STATUS_LABEL, TEMPLATE_FIELDS } from "@/lib/hub/casting-core";
import { brevoConfigured } from "@/lib/hub/brevo";

export default async function Templates({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { p, canView, canEdit } = await castingAccess(slug);
  if (!p) return <NoAccess what="this production" />;
  if (!canView) return <NoAccess what={`Casting on ${p.title}`} />;
  const templates = await templatesFor(p.id);
  return (
    <>
      <PageHead title="Casting email templates" lead={<Link className="link" href={`/productions/${p.slug}/casting`}>{p.title} · Casting</Link>} />
      <p className="msg">
        Emails go from casting@bleuskm.com (crew@bleuskm.com for crew calls) and replies come back there. Placeholders: {TEMPLATE_FIELDS.map((f) => `{{${f}}}`).join(", ")}.
        {!brevoConfigured() && " Sending is switched off until BREVO_KEY is added to the hub's Vercel project."}
      </p>
      {templates.length === 0 && <p className="small">The standard templates appear when the first casting call is created.</p>}
      {templates.map((t) => (
        <details key={t.id} className="panel">
          <summary><strong>{t.name}</strong> <span className="small">· {t.subject}{t.sets_status ? ` · sets ${APP_STATUS_LABEL[t.sets_status]}` : ""}</span></summary>
          {canEdit ? <HubForm action={saveTemplate}><TemplateFields t={t} productionId={p.id} /></HubForm>
            : <div style={{ whiteSpace: "pre-wrap" }}>{t.body}</div>}
        </details>
      ))}
      {canEdit && templates.length > 0 && (
        <details className="panel">
          <summary><strong>Add a template</strong></summary>
          <HubForm action={saveTemplate} resetOnDone><TemplateFields productionId={p.id} /></HubForm>
        </details>
      )}
    </>
  );
}

function TemplateFields({ t, productionId }: { t?: Template; productionId: string }) {
  return (
    <>
      {t && <input type="hidden" name="id" value={t.id} />}
      <input type="hidden" name="production_id" value={productionId} />
      <label className="field"><span>Name</span><input name="name" required maxLength={120} defaultValue={t?.name ?? ""} /></label>
      <label className="field"><span>When sent, move the applicant to</span>
        <select name="sets_status" defaultValue={t?.sets_status ?? ""}>
          <option value="">Don&apos;t change status</option>
          {APP_STATUSES.map((s) => <option key={s} value={s}>{APP_STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <label className="field wide"><span>Subject</span><input name="subject" required maxLength={200} defaultValue={t?.subject ?? ""} /></label>
      <label className="field wide"><span>Message</span><textarea name="body" rows={10} required maxLength={20000} defaultValue={t?.body ?? ""} /></label>
      <div className="wide"><Submit>{t ? "Save template" : "Add template"}</Submit></div>
    </>
  );
}
