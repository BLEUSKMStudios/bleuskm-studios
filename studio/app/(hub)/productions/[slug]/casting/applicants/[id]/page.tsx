import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { dbCheck, hubContext } from "@/lib/hub/data";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { addNote, deleteNote, saveSession, sendEmails, updateApplication } from "@/lib/hub/casting-actions";
import {
  APP_COLS, MATERIAL_COLS, materialKey, signMaterials, MESSAGE_COLS, SESSION_COLS, castingAccess, callsAndRoles, peopleNames, templatesFor,
  type Application, type Material, type Message, type Note, type Session,
} from "@/lib/hub/casting-data";
import {
  APP_STATUSES, APP_STATUS_LABEL, MATERIAL_LABEL, SESSION_KINDS, SESSION_KIND_LABEL, SESSION_STATUSES, SESSION_STATUS_LABEL,
  firstName, formatStudioTime, isoToStudioLocal, senderEmailFor, type TemplateVars,
} from "@/lib/hub/casting-core";
import { brevoConfigured } from "@/lib/hub/brevo";
import { isUuid } from "@/lib/sections";
import { EmailComposer } from "./EmailComposer";
import { ActionForm } from "@/components/hub/ActionForm";
import { SendId } from "@/components/hub/SendId";
import { cancelSelfTape, inviteToSelfTape, remindSelfTape } from "@/lib/hub/selftape-actions";
import { STATUS_LABEL, STATUS_TONE, effectiveStatus } from "@/lib/contracts/data";

const SELFTAPE_STATUS: Record<string, string> = { draft: "Preparing", sent: "Invited", opened: "Link opened", submitted: "Received", expired: "Expired", cancelled: "Cancelled" };

function SelftapeDocPicker({ name, label, docs }: { name: string; label: string; docs: { id: string; title: string }[] }) {
  if (!docs.length) return null;
  return (
    <label className="field"><span>{label}</span>
      <select name={name} defaultValue=""><option value="">None</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
    </label>
  );
}

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
  const signed = await signMaterials(materials);
  const { data: invites } = await supabase.from("selftape_invitations")
    .select("id, status, deadline, instructions, sent_at, opened_at, submitted_at, reminder_sent_at, created_at")
    .eq("application_id", a.id).order("created_at", { ascending: false });
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
  const isCrew = (call?.public_slug ?? "").endsWith("-crew");
  const selftapeTpl = templates.find((t) => t.key === "selftape_invite");
  const { data: docRows } = await supabase.from("documents").select("id, title").eq("production_id", p.id).order("title").limit(200);
  const docs = (docRows ?? []) as { id: string; title: string }[];
  // Agreements show only to people with Documents access (the database decides).
  const [{ data: agreements }, canSendAgreement] = await Promise.all([
    supabase.from("contract_requests").select("id, template_key, status, expires_at, signed_at, sent_at, created_at").eq("application_id", a.id).order("created_at", { ascending: false }),
    dbCheck(p.id, "documents", "edit"),
  ]);
  const { data: packages } = await supabase.from("onboarding_packages").select("id, status, sent_at, acknowledged_at, subject").eq("application_id", a.id).order("created_at", { ascending: false }).limit(20);

  return (
    <>
      <PageHead title={a.full_name} lead={<><Link className="link" href={base}>{p.title} · Casting</Link> · {role?.name ?? "Role"} · <span className={`tag tag-app-${a.status}`}>{APP_STATUS_LABEL[a.status]}</span></>} />

      <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <section className="panel">
          {headshot && signed.get(materialKey(headshot)) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signed.get(materialKey(headshot))} alt={`Headshot of ${a.full_name}`} style={{ width: "100%", maxHeight: 420, objectFit: "contain", background: "#0b0b0b", marginBottom: 12 }} />
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
              const href = m.storage_path ? signed.get(materialKey(m)) : m.url;
              return (
                <li key={m.id}>
                  {href && m.storage_path && (m.mime_type ?? "").startsWith("video/") && (
                    <video controls preload="metadata" src={href} style={{ width: "100%", maxHeight: 360, background: "#000", marginBottom: 6 }} />
                  )}
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

      {(canSendAgreement || (agreements ?? []).length > 0) && (
        <section className="panel">
          <div className="panel-head">
            <h2>Agreement</h2>
            {canSendAgreement && <span className="row-actions"><Link className="btn btn-inline" href={`/contracts/new?application=${a.id}`}>Send agreement</Link><Link className="btn btn-inline btn-quiet" href={`/onboarding/new?application=${a.id}`}>Send materials</Link></span>}
          </div>
          {(agreements ?? []).length === 0 && <p className="small">No agreement yet. {["selected", "offered", "cast"].includes(a.status) ? "Ready for one: Send agreement recommends the right template and fills it in." : "Usually sent once someone is selected."}</p>}
          <ul className="plain">
            {(agreements ?? []).map((g) => {
              const st = effectiveStatus(g as never);
              return (
                <li key={g.id as string}>
                  <Link className="link" href={`/contracts/${g.id}`}>{String(g.template_key).replace(/_/g, " ")}</Link>{" "}
                  <span className={`tag tag-sm tone-${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}</span>{" "}
                  <span className="small">{formatStudioTime((g.signed_at ?? g.sent_at ?? g.created_at) as string)}</span>
                </li>
              );
            })}
            {(packages ?? []).map((k) => (
              <li key={k.id as string}>Materials: <Link className="link" href={`/onboarding/${k.id}`}>{k.subject as string}</Link>{" "}
                <span className="tag tag-sm">{k.status === "acknowledged" ? "confirmed received" : k.status as string}</span>{" "}
                <span className="small">{formatStudioTime((k.acknowledged_at ?? k.sent_at) as string)}</span></li>
            ))}
          </ul>
        </section>
      )}

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
        <h2>Self-tape</h2>
        {(invites ?? []).length === 0 && <p className="small">No self-tape requested yet.</p>}
        <ul className="plain">
          {(invites ?? []).map((i) => (
            <li key={i.id as string} style={{ marginBottom: 10 }}>
              <span className={`tag tag-sm ${i.status === "submitted" ? "tone-good" : i.status === "cancelled" || i.status === "expired" ? "tone-bad" : "tone-info"}`}>{SELFTAPE_STATUS[i.status as string] ?? (i.status as string)}</span>{" "}
              {i.deadline ? <>due {formatStudioTime(i.deadline as string)}</> : "no deadline"}
              <span className="small"> · sent {formatStudioTime(i.sent_at as string)}{i.opened_at ? ` · opened ${formatStudioTime(i.opened_at as string)}` : ""}{i.submitted_at ? ` · received ${formatStudioTime(i.submitted_at as string)}` : ""}{i.reminder_sent_at ? ` · reminded ${formatStudioTime(i.reminder_sent_at as string)}` : ""}</span>
              {canEdit && ["sent", "opened"].includes(i.status as string) && (
                <div className="row-actions">
                  <ActionForm action={remindSelfTape} fields={{ invitation_id: i.id as string }} label="Send reminder" busy="Sending…" quiet confirm="Send a reminder with a fresh link? The previous link stops working." />
                  <ActionForm action={cancelSelfTape} fields={{ invitation_id: i.id as string }} label="Cancel" busy="Cancelling…" quiet confirm="Cancel this self-tape request? The link stops working." />
                </div>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <details className="panel" style={{ background: "#101010" }}>
            <summary><strong>Invite to self-tape</strong> <span className="small">from {isCrew ? "crew@" : "casting@"}bleuskm.com, with a personal secure upload link</span></summary>
            <HubForm action={inviteToSelfTape}>
              <SendId />
              <input type="hidden" name="ids" value={a.id} />
              <input type="hidden" name="production_id" value={p.id} />
              <label className="field"><span>Deadline (Central)</span><input type="datetime-local" name="deadline" /></label>
              <label className="field"><span>Sides link (optional)</span><input name="sides_url" placeholder="https://drive.google.com/…" /></label>
              <SelftapeDocPicker name="sides_document_id" label="Sides from Documents (optional)" docs={docs} />
              <SelftapeDocPicker name="treatment_document_id" label="Treatment from Documents (optional)" docs={docs} />
              <label className="field wide"><span>Instructions</span><textarea name="instructions" rows={5} maxLength={10000} placeholder="Scenes to prepare, framing, slate, length…" /></label>
              <label className="field wide"><span>Email subject (leave empty to use the template)</span><input name="subject" maxLength={200} defaultValue={selftapeTpl?.subject ?? ""} /></label>
              <label className="field wide"><span>Email (keep {"{{upload_link}}"}: each person gets their own link)</span><textarea name="body" rows={10} maxLength={20000} defaultValue={selftapeTpl?.body ?? ""} /></label>
              <div className="wide"><Submit busy="Sending…">Send self-tape invitation</Submit></div>
            </HubForm>
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
