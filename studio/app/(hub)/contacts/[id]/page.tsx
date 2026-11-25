import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext } from "@/lib/hub/data";
import { holdsSection } from "@/lib/hub/nav";
import { writeBlockReason } from "@/lib/hub/env";
import { moduleByKey } from "@/lib/hub/modules";
import { isUuid } from "@/lib/sections";
import { APP_STATUS_LABEL, MATERIAL_LABEL, formatStudioTime, type AppStatus } from "@/lib/hub/casting-core";
import { materialKey, signMaterials } from "@/lib/hub/casting-data";
import { CATEGORY_LABEL, activityLabel } from "@/lib/hub/contacts";
import { addContactNote, mergeContact, saveContactTags, subscribeContact, unsubscribeContact } from "@/lib/hub/contact-actions";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { RecordForm } from "@/components/hub/RecordForm";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { ActionForm } from "@/components/hub/ActionForm";

type Sub = { id: string; status: string; consent_source: string | null; consent_text: string | null; consented_at: string | null; unsubscribed_at: string | null; audiences: { id: string; name: string; marketing: boolean } | null };
type App = { id: string; production_id: string; status: AppStatus; submitted_at: string; casting_roles: { name: string } | null; casting_calls: { title: string; public_slug: string } | null };
type Mat = { id: string; application_id: string; kind: keyof typeof MATERIAL_LABEL; storage_path: string | null; storage_bucket: string; url: string | null; file_name: string | null; label: string | null };
type Activity = { id: string; kind: string; summary: string; occurred_at: string; actor_name: string | null; production_id: string | null };
type Msg = { id: string; direction: string; channel: string; from_address: string | null; subject: string | null; status: string; sent_at: string | null; created_at: string };

// One person: details, lists and consent, every application with its files,
// roster places, documents, emails, and the full timeline. Each block shows
// only what the viewer's own access allows (the database decides).
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me, grants, productions } = await hubContext();
  if (!isUuid(id)) return <NoAccess what="this contact" />;
  const { supabase } = await loadSession();
  const { data: c } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  if (!c) return <NoAccess what="this contact" />;
  if (c.merged_into) {
    return (
      <>
        <PageHead title={c.full_name as string} lead="This record was merged into another contact." />
        <p><Link className="link" href={`/contacts/${c.merged_into}`}>Open the contact it was merged into</Link></p>
      </>
    );
  }

  const [subs, apps, team, docs, msgs, acts, audiences, submissions, agreements] = await Promise.all([
    supabase.from("contact_subscriptions").select("id, status, consent_source, consent_text, consented_at, unsubscribed_at, audiences(id, name, marketing)").eq("contact_id", id),
    supabase.from("casting_applications").select("id, production_id, status, submitted_at, casting_roles(name), casting_calls(title, public_slug)").eq("contact_id", id).order("submitted_at", { ascending: false }),
    supabase.from("production_team").select("id, production_id, position, team, department, status").eq("contact_id", id),
    supabase.from("documents").select("id, production_id, title, category, status").eq("contact_id", id),
    supabase.from("comm_messages").select("id, direction, channel, from_address, subject, status, sent_at, created_at").eq("contact_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("activity").select("id, kind, summary, occurred_at, actor_name, production_id").eq("contact_id", id).order("occurred_at", { ascending: false }).limit(300),
    supabase.from("audiences").select("id, name, marketing").order("name"),
    supabase.from("intake_submissions").select("id, kind, film_title, payload, received_at").eq("contact_id", id).order("received_at", { ascending: false }).limit(50),
    supabase.from("contract_requests").select("id, production_id, template_key, status").eq("contact_id", id).order("created_at", { ascending: false }),
  ]);
  const applications = (apps.data ?? []) as unknown as App[];
  const appIds = applications.map((a) => a.id);
  const { data: matRows } = appIds.length
    ? await supabase.from("casting_materials").select("id, application_id, kind, storage_path, storage_bucket, url, file_name, label").in("application_id", appIds)
    : { data: [] };
  const materials = (matRows ?? []) as Mat[];
  const signed = await signMaterials(materials);
  const prod = (pid: string | null) => productions.find((p) => p.id === pid);
  const canEdit = me.isOwner || grants.some((g) => g.section_key === "contacts" && g.production_id === null && g.level === "edit");
  const blocked = writeBlockReason();
  const editable = canEdit && !blocked;
  const def = moduleByKey("contacts")!;
  const subscriptions = (subs.data ?? []) as unknown as Sub[];
  const subscribedIds = new Set(subscriptions.filter((s) => s.status === "subscribed").map((s) => s.audiences?.id));
  const marketingLists = ((audiences.data ?? []) as { id: string; name: string; marketing: boolean }[]).filter((a) => a.marketing && !subscribedIds.has(a.id));
  const canSeeContacts = me.isOwner || holdsSection(grants, "contacts");

  return (
    <>
      <PageHead
        title={c.full_name as string}
        lead={<><Link className="link" href="/contacts">Contacts</Link> · {CATEGORY_LABEL[c.category as string] ?? c.category}{c.email_status !== "ok" ? <> · <span className="tag tone-bad">{c.email_status as string}</span></> : null}</>}
      />

      <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <section className="panel">
          <h2>Details</h2>
          {editable ? (
            <RecordForm module="contacts" fields={def.fields} values={c} id={id} scope="" submitLabel="Save changes" />
          ) : (
            <dl className="facts">
              {c.email && <><dt>Email</dt><dd><a className="link" href={`mailto:${c.email}`}>{c.email as string}</a></dd></>}
              {c.phone && <><dt>Phone</dt><dd>{c.phone as string}</dd></>}
              {c.city && <><dt>City</dt><dd>{c.city as string}</dd></>}
              {c.roles && <><dt>Roles</dt><dd>{c.roles as string}</dd></>}
              {c.website && <><dt>Website</dt><dd><a className="link" href={c.website as string} target="_blank" rel="noreferrer noopener">{c.website as string}</a></dd></>}
              {c.notes && <><dt>Notes</dt><dd className="pre">{c.notes as string}</dd></>}
            </dl>
          )}
          <h3>Tags</h3>
          {editable ? (
            <HubForm action={saveContactTags} className="inline-form">
              <input type="hidden" name="contact_id" value={id} />
              <label className="field" style={{ flex: "1 1 240px" }}><span>Tags (comma separated)</span><input name="tags" defaultValue={(c.tags as string[]).join(", ")} /></label>
              <Submit>Save tags</Submit>
            </HubForm>
          ) : <p>{(c.tags as string[]).map((t) => <span key={t} className="tag tag-sm">{t}</span>)}</p>}
        </section>

        <section className="panel">
          <h2>Lists and consent</h2>
          {subscriptions.length === 0 && <p className="small">Not on any list.</p>}
          <ul className="plain">
            {subscriptions.map((s) => (
              <li key={s.id} style={{ marginBottom: 10 }}>
                <strong>{s.audiences?.name}</strong>{" "}
                <span className={`tag tag-sm ${s.status === "subscribed" ? "tone-good" : "tone-bad"}`}>{s.status}</span>
                {!s.audiences?.marketing && <span className="small"> · not marketing</span>}
                <div className="small">
                  {s.status === "subscribed" ? <>Since {formatStudioTime(s.consented_at)}{s.consent_source ? ` · ${s.consent_source}` : ""}</> : <>Unsubscribed {formatStudioTime(s.unsubscribed_at)}</>}
                  {s.consent_text && <> · “{s.consent_text}”</>}
                </div>
                {editable && s.status === "subscribed" && (
                  <ActionForm action={unsubscribeContact} fields={{ subscription_id: s.id, contact_id: id }} label="Unsubscribe" busy="Saving…" quiet confirm="Unsubscribe this person from this list? Only they can opt back in." />
                )}
              </li>
            ))}
          </ul>
          {editable && marketingLists.length > 0 && (
            <details>
              <summary className="link">Add to a list with their consent</summary>
              <HubForm action={subscribeContact}>
                <input type="hidden" name="contact_id" value={id} />
                <label className="field"><span>List</span><select name="audience_id">{marketingLists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
                <label className="field"><span>Where and how they agreed <em className="req">*</em></span><input name="consent_source" required maxLength={200} placeholder="Asked by email on Dec 2" /></label>
                <label className="field wide"><span>What they agreed to</span><textarea name="consent_text" maxLength={2000} /></label>
                <Submit>Subscribe</Submit>
              </HubForm>
            </details>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Applications</h2>
        {applications.length === 0 && <p className="small">No applications you can see.</p>}
        {applications.map((a) => {
          const p = prod(a.production_id);
          const files = materials.filter((m) => m.application_id === a.id);
          return (
            <div key={a.id} style={{ marginBottom: 14 }}>
              <strong>{a.casting_roles?.name ?? "Role"}</strong> · {p?.title ?? "Production"}{a.casting_calls?.public_slug.endsWith("-crew") ? " · crew" : ""}{" "}
              <span className={`tag tag-sm tag-app-${a.status}`}>{APP_STATUS_LABEL[a.status]}</span>{" "}
              {p && <Link className="link" href={`/productions/${p.slug}/casting/applicants/${a.id}`}>Open</Link>}
              <div className="small">Applied {formatStudioTime(a.submitted_at)}</div>
              {files.length > 0 && (
                <ul className="plain small">
                  {files.map((m) => {
                    const href = m.storage_path ? signed.get(materialKey(m)) : m.url;
                    return <li key={m.id}>{MATERIAL_LABEL[m.kind]}: {href ? <a className="link" href={href} target="_blank" rel="noopener noreferrer">{m.file_name ?? m.label ?? m.url}</a> : "unavailable"}</li>;
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      {((team.data ?? []).length > 0 || (docs.data ?? []).length > 0 || (agreements.data ?? []).length > 0) && (
        <section className="panel">
          <div className="panel-head"><h2>Productions and documents</h2><Link className="btn btn-inline btn-quiet" href={`/contracts/new?contact=${id}`}>Send agreement</Link></div>
          <ul className="plain">
            {(team.data ?? []).map((t) => (
              <li key={t.id as string}><strong>{prod(t.production_id as string)?.title}</strong> · {t.position as string} ({t.team as string}{t.department ? `, ${t.department}` : ""}) · <span className="tag tag-sm">{t.status as string}</span> <Link className="link" href={`/crew-roster/${t.id}`}>Open</Link> · <Link className="link" href={`/contracts/new?team=${t.id}`}>Send agreement</Link> · <Link className="link" href={`/onboarding/new?team=${t.id}`}>Send materials</Link></li>
            ))}
            {(agreements.data ?? []).filter((g) => g.status !== "signed").map((g) => (
              <li key={g.id as string}>Agreement: <Link className="link" href={`/contracts/${g.id}`}>{String(g.template_key).replace(/_/g, " ")}</Link> · <span className="tag tag-sm">{g.status as string}</span> · {prod(g.production_id as string)?.title ?? ""}</li>
            ))}
            {(docs.data ?? []).map((d) => (
              <li key={d.id as string}>Document: <Link className="link" href={`/documents/${d.id}`}>{d.title as string}</Link> · {d.category as string} · <span className="tag tag-sm">{d.status as string}</span>{d.production_id ? ` · ${prod(d.production_id as string)?.title ?? ""}` : ""}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Emails</h2>
        {(msgs.data ?? []).length === 0 && <p className="small">No emails you can see.</p>}
        <ul className="activity">
          {((msgs.data ?? []) as Msg[]).map((m) => (
            <li key={m.id}>
              <span>{m.direction === "inbound" ? "From them" : `From ${m.from_address ?? "Studio OS"}`}: <Link className="link" href={`/communications/messages/${m.id}`}>{m.subject ?? "(no subject)"}</Link> <span className={`tag tag-sm ${m.status === "failed" || m.status === "bounced" || m.status === "blocked" ? "tone-bad" : m.status === "sent" || m.status === "delivered" || m.status === "opened" ? "tone-good" : ""}`}>{m.status}</span></span>
              <span className="small">{formatStudioTime(m.sent_at ?? m.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Timeline</h2>
        {editable && (
          <HubForm action={addContactNote} className="inline-form" resetOnDone>
            <input type="hidden" name="contact_id" value={id} />
            <label className="field" style={{ flex: "1 1 320px" }}><span>Add a private note</span><input name="body" maxLength={480} required /></label>
            <Submit>Add note</Submit>
          </HubForm>
        )}
        <ul className="activity">
          {((acts.data ?? []) as Activity[]).map((a) => (
            <li key={a.id}>
              <span><span className="tag tag-sm">{activityLabel(a.kind)}</span> {a.summary}{a.production_id ? <span className="small"> · {prod(a.production_id)?.title}</span> : null}{a.actor_name ? <span className="small"> · {a.actor_name}</span> : null}</span>
              <span className="small">{formatStudioTime(a.occurred_at)}</span>
            </li>
          ))}
        </ul>
        {(acts.data ?? []).length === 0 && <p className="small">Nothing yet.</p>}
      </section>

      {(submissions.data ?? []).length > 0 && (
        <section className="panel">
          <h2>Website forms</h2>
          {(submissions.data ?? []).map((s) => (
            <details key={s.id as string}>
              <summary>{String(s.kind).replace("_", " ")}{s.film_title ? ` · ${s.film_title}` : ""} · <span className="small">{formatStudioTime(s.received_at as string)}</span></summary>
              <dl className="facts">
                {Object.entries((s.payload ?? {}) as Record<string, unknown>).map(([k, v]) => v == null || v === "" ? null : <div className="fact" key={k}><dt>{k}</dt><dd className="pre">{String(v)}</dd></div>)}
              </dl>
            </details>
          ))}
        </section>
      )}

      {me.isOwner && !blocked && canSeeContacts && (
        <section className="panel">
          <h2>Merge a duplicate</h2>
          <p className="small">If this person also has another record (for example a second email address), merge it here. Its applications, emails, lists and history move to this contact. The duplicate is kept, marked as merged.</p>
          <HubForm action={mergeContact} className="inline-form" confirm="Merge the other record into this contact? This can't be undone automatically.">
            <input type="hidden" name="contact_id" value={id} />
            <label className="field" style={{ flex: "1 1 260px" }}><span>The duplicate&apos;s email</span><input name="duplicate_email" type="email" required /></label>
            <Submit busy="Merging…">Merge into this contact</Submit>
          </HubForm>
        </section>
      )}
    </>
  );
}
