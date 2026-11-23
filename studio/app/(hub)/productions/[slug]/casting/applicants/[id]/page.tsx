import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext } from "@/lib/hub/data";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { addNote, deleteNote, saveSession, sendEmails, updateApplication } from "@/lib/hub/casting-actions";
import {
  APP_COLS, BUCKET, MATERIAL_COLS, MESSAGE_COLS, SESSION_COLS, castingAccess, callsAndRoles, peopleNames, templatesFor,
  type Application, type Material, type Message, type Note, type Session,
} from "@/lib/hub/casting-data";
import {
  APP_STATUSES, APP_STATUS_LABEL, MATERIAL_LABEL, SESSION_KINDS, SESSION_KIND_LABEL, SESSION_STATUSES, SESSION_STATUS_LABEL,
  firstName, formatStudioTime, isoToStudioLocal, senderEmailFor, type TemplateVars,
} from "@/lib/hub/casting-core";
import { brevoConfigured } from "@/lib/hub/brevo";
import { isUuid } from "@/lib/sections";
import { EmailComposer } from "./EmailComposer";

function size(n: number | null) {
  if (!n) return "";
  return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default async function ApplicantPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { p, canView, canEdit } = await castingAccess(slug);
  if (!p) return <NoAccess what="this production" />;
  if (!canView || !isUuid(id)) return <NoAccess what={`Casting on ${p.title}`} />;
  const { supabase } = await loadSession();
  const { data: row } = await supabase.from("casting_applications").select(APP_COLS).eq("id", id).eq("production_id", p.id).maybeSingle();
  if (!row) return <NoAccess what="this applicant" />;
  const a = row as Application;
  const [{ calls, roles }, templates, { data: mats }, { data: notes }, { data: sessions }, { data: msgs }, { data: others }, { me }] = await Promise.all([
    callsAndRoles(p.id),
    templatesFor(p.id),
    supabase.from("casting_materials").select(MATERIAL_COLS).eq("application_id", a.id).order("created_at"),
    supabase.from("casting_notes").select("id, application_id, author_id, body, created_at").eq("application_id", a.id).order("created_at", { ascending: false }),
    supabase.from("casting_sessions").select(SESSION_COLS).eq("application_id", a.id).order("starts_at", { ascending: true, nullsFirst: false }),
    supabase.from("casting_messages").select(MESSAGE_COLS).eq("application_id", a.id).order("sent_at", { ascending: false }),
    supabase.from("casting_applications").select("id, role_id, status").eq("production_id", p.id).eq("email", a.email).neq("id", a.id),
    hubContext(),
  ]);
  const materials = (mats ?? []) as Material[];
  const noteList = (notes ?? []) as Note[];
  const sessionList = (sessions ?? []) as Session[];
  const messages = (msgs ?? []) as Message[];
  const role = roles.find((r) => r.id === a.role_id);
  const call = calls.find((c) => c.id === a.call_id);
  const base = `/productions/${p.slug}/casting`;

  // Private files open through short-lived links, made with this person's own rights.
  const paths = materials.filter((m) => m.storage_path).map((m) => m.storage_path!) ;
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.signedUrl && s.path) signed.set(s.path, s.signedUrl);
  }
  const names = await peopleNames([...noteList.map((n) => n.author_id), ...messages.map((m) => m.sent_by)]);
  const nextSession = sessionList.find((s) => s.status === "scheduled");
  const vars: TemplateVars = {
    first_name: firstName(a.full_name), full_name: a.full_name, role: role?.name ?? "", film: p.title,
    deadline: formatStudioTime(call?.deadline),
    session_kind: nextSession ? SESSION_KIND_LABEL[nextSession.kind] : "",
    session_time: nextSession ? formatStudioTime(nextSession.starts_at) : "",
    session_location: nextSession ? [nextSession.location, nextSession.meeting_link].filter(Boolean).join(" · ") : "",
  };
  const headshot = materials.find((m) => m.kind === "headshot" && m.storage_path && (m.mime_type ?? "").startsWith("image/"));

  return (
    <>
      <PageHead title={a.full_name} lead={<><Link className="link" href={base}>{p.title} · Casting</Link> · {role?.name ?? "Role"} · <span className={`tag tag-app-${a.status}`}>{APP_STATUS_LABEL[a.status]}</span></>} />

      <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <section className="panel">
          {headshot && signed.get(headshot.storage_path!) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signed.get(headshot.storage_path!)} alt={`Headshot of ${a.full_name}`} style={{ width: "100%", maxHeight: 420, objectFit: "contain", background: "#0b0b0b", marginBottom: 12 }} />
          )}
          <dl className="facts">
            <dt>Email</dt><dd><a className="link" href={`mailto:${a.email}`}>{a.email}</a></dd>
            {a.phone && <><dt>Phone</dt><dd>{a.phone}</dd></>}
            {a.age !== null && <><dt>Age</dt><dd>{a.age}</dd></>}
            {a.location && <><dt>Location</dt><dd>{a.location}</dd></>}
            {a.pronouns && <><dt>Pronouns</dt><dd>{a.pronouns}</dd></>}
            {a.availability && <><dt>Availability</dt><dd>{a.availability}</dd></>}
            <dt>Submitted</dt><dd>{formatStudioTime(a.submitted_at)} ({a.source}{a.access_code ? `, early access ${a.access_code}` : ""})</dd>
            <dt>Casting call</dt><dd>{call ? <Link className="link" href={`${base}/calls/${call.id}`}>{call.title}</Link> : ""}</dd>
          </dl>
          {(others ?? []).length > 0 && (
            <p className="small">Also applied for: {(others ?? []).map((o) => (
              <Link key={o.id as string} className="link" href={`${base}/applicants/${o.id}`}>{roles.find((r) => r.id === o.role_id)?.name ?? "another role"} </Link>
            ))}</p>
          )}
          {a.about && <><h2>About</h2><p style={{ whiteSpace: "pre-wrap" }}>{a.about}</p></>}
        </section>

        <section className="panel">
          <h2>Materials</h2>
          {materials.length === 0 && <p className="small">No materials.</p>}
          <ul className="plain">
            {materials.map((m) => {
              const href = m.storage_path ? signed.get(m.storage_path) : m.url;
              return (
                <li key={m.id}>
                  <strong>{MATERIAL_LABEL[m.kind]}</strong>{" "}
                  {href ? <a className="link" href={href} target="_blank" rel="noopener noreferrer">{m.file_name ?? m.label ?? m.url}</a> : <span className="small">file unavailable</span>}
                  {m.storage_path && <span className="small"> · {size(m.size_bytes)} · link valid 1 hour</span>}
                </li>
              );
            })}
          </ul>

          <h2>Review</h2>
          {canEdit ? (
            <HubForm action={updateApplication} className="inline-form">
              <input type="hidden" name="id" value={a.id} />
              <label className="field"><span>Status</span>
                <select name="status" defaultValue={a.status}>
                  {APP_STATUSES.map((s) => <option key={s} value={s}>{APP_STATUS_LABEL[s]}</option>)}
                </select>
              </label>
              <label className="field" style={{ minWidth: 120 }}><span>Rating</span>
                <select name="rating" defaultValue={a.rating ?? ""}>
                  <option value="">None</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
                </select>
              </label>
              <Submit>Save</Submit>
            </HubForm>
          ) : <p>{APP_STATUS_LABEL[a.status]}{a.rating ? ` · ${"★".repeat(a.rating)}` : ""}</p>}
          <p className="small">Status last changed {formatStudioTime(a.status_changed_at)}.</p>
        </section>
      </div>

      <section className="panel">
        <h2>Callbacks and auditions</h2>
        {sessionList.length === 0 && <p className="small">Nothing scheduled.</p>}
        {sessionList.map((s) => (
          <details key={s.id} className="panel" style={{ background: "#101010" }}>
            <summary><strong>{SESSION_KIND_LABEL[s.kind]}</strong> · {s.starts_at ? formatStudioTime(s.starts_at) : "time not set"} · {SESSION_STATUS_LABEL[s.status]}{s.location ? ` · ${s.location}` : ""}</summary>
            {canEdit ? <HubForm action={saveSession}><SessionFields s={s} applicationId={a.id} /></HubForm>
              : <p style={{ whiteSpace: "pre-wrap" }}>{s.notes}</p>}
          </details>
        ))}
        {canEdit && (
          <details className="panel" style={{ background: "#101010" }}>
            <summary><strong>Schedule a callback, audition, chemistry read or self-tape</strong></summary>
            <HubForm action={saveSession} resetOnDone><SessionFields applicationId={a.id} /></HubForm>
          </details>
        )}
      </section>

      <section className="panel">
        <h2>Notes</h2>
        {canEdit && (
          <HubForm action={addNote} className="action-form" resetOnDone>
            <input type="hidden" name="application_id" value={a.id} />
            <label className="field"><span>Add a note (seen by everyone with access to this production's Casting)</span><textarea name="body" rows={3} maxLength={5000} required /></label>
            <div><Submit>Add note</Submit></div>
          </HubForm>
        )}
        <ul className="plain">
          {noteList.map((n) => (
            <li key={n.id}>
              <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
              <div className="small">{(n.author_id && names.get(n.author_id)) ?? (n.author_id === me.id ? me.fullName : "Team member")} · {formatStudioTime(n.created_at)}</div>
              {canEdit && (me.isOwner || n.author_id === me.id) && (
                <HubForm action={deleteNote} className="action-form" confirm="Remove this note?">
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="production_id" value={p.id} />
                  <div><Submit quiet busy="Removing…">Remove</Submit></div>
                </HubForm>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Email</h2>
        {canEdit && (brevoConfigured() ? (
          <EmailComposer action={sendEmails} templates={templates} vars={vars} applicationId={a.id} productionId={p.id} statusLabels={APP_STATUS_LABEL} from={senderEmailFor(call?.public_slug)} />
        ) : <p className="msg error">Sending is switched off until BREVO_KEY is added to the hub&apos;s Vercel project.</p>)}
        <h2 style={{ marginTop: 18 }}>Sent</h2>
        {messages.length === 0 && <p className="small">No emails sent from Studio OS yet. (The automatic “submission received” email is sent by the website.)</p>}
        <ul className="plain">
          {messages.map((m) => (
            <li key={m.id}>
              <details>
                <summary>{m.status === "sent" ? "✓" : "✗ Not sent:"} {m.subject} <span className="small">· {formatStudioTime(m.sent_at)} · {(m.sent_by && names.get(m.sent_by)) ?? (m.sent_by === me.id ? me.fullName : "Team member")}{m.error ? ` · ${m.error}` : ""}</span></summary>
                <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{m.body}</div>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function SessionFields({ s, applicationId }: { s?: Session; applicationId: string }) {
  return (
    <>
      {s && <input type="hidden" name="id" value={s.id} />}
      <input type="hidden" name="application_id" value={applicationId} />
      <label className="field"><span>Kind</span>
        <select name="kind" defaultValue={s?.kind ?? "callback"}>
          {SESSION_KINDS.map((k) => <option key={k} value={k}>{SESSION_KIND_LABEL[k]}</option>)}
        </select>
      </label>
      <label className="field"><span>Date and time (Central)</span><input type="datetime-local" name="starts_at" defaultValue={isoToStudioLocal(s?.starts_at)} /></label>
      <label className="field"><span>Location</span><input name="location" maxLength={300} defaultValue={s?.location ?? ""} /></label>
      <label className="field"><span>Video link (optional)</span><input name="meeting_link" maxLength={1000} defaultValue={s?.meeting_link ?? ""} placeholder="https://" /></label>
      <label className="field"><span>Status</span>
        <select name="status" defaultValue={s?.status ?? "scheduled"}>
          {SESSION_STATUSES.map((k) => <option key={k} value={k}>{SESSION_STATUS_LABEL[k]}</option>)}
        </select>
      </label>
      <label className="field wide"><span>Notes</span><textarea name="notes" rows={3} maxLength={5000} defaultValue={s?.notes ?? ""} /></label>
      <div className="wide"><Submit>{s ? "Save session" : "Add"}</Submit></div>
    </>
  );
}
