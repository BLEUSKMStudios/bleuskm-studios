import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { dbCheck } from "@/lib/hub/data";
import { isUuid } from "@/lib/sections";
import { cancelOnboarding } from "@/lib/hub/onboarding-actions";
import { writeBlockReason } from "@/lib/hub/env";
import { PageHead } from "@/components/hub/Page";
import { ActionForm } from "@/components/hub/ActionForm";
import { LocalTime } from "@/components/hub/LocalTime";

export const metadata = { title: "Onboarding package" };

const STATUS: Record<string, string> = { draft: "Draft", sent: "Sent", opened: "Opened", acknowledged: "Confirmed received", cancelled: "Cancelled" };

export default async function OnboardingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const { supabase } = await loadSession();
  const { data: p } = await supabase.from("onboarding_packages")
    .select("id, production_id, team_id, application_id, contact_id, recipient_name, recipient_email, identity_key, subject, message, require_ack, status, sent_at, opened_at, acknowledged_at, ack_name, created_at")
    .eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: items }, { data: prod }, canEdit] = await Promise.all([
    supabase.from("onboarding_items").select("id, document_id, title, category, first_opened_at, open_count").eq("package_id", id).order("sort"),
    supabase.from("productions").select("title").eq("id", p.production_id).maybeSingle(),
    dbCheck(p.production_id as string, "documents", "edit"),
  ]);
  const opened = (items ?? []).filter((i) => i.first_opened_at).length;
  const open = p.status === "sent" || p.status === "opened";
  return (
    <>
      <PageHead title={`Materials for ${p.recipient_name}`} lead={`${prod?.title ?? ""} · ${STATUS[p.status as string] ?? p.status}`}>
        {p.contact_id && <Link className="btn btn-inline btn-quiet" href={`/contacts/${p.contact_id}`}>Contact</Link>}
      </PageHead>
      {sp.sent && <p className="msg" role="status">Sent from {p.identity_key as string}@bleuskm.com. {p.recipient_name as string} has a personal link to these documents.</p>}
      <section className="panel">
        <dl className="facts">
          <dt>To</dt><dd>{p.recipient_name as string} &lt;{p.recipient_email as string}&gt;</dd>
          <dt>From</dt><dd>{p.identity_key as string}@bleuskm.com</dd>
          <dt>Subject</dt><dd>{p.subject as string}</dd>
          <dt>Sent</dt><dd>{p.sent_at ? <LocalTime iso={p.sent_at as string} /> : "Not sent"}</dd>
          <dt>First opened</dt><dd>{p.opened_at ? <LocalTime iso={p.opened_at as string} /> : "Not yet"}</dd>
          <dt>Confirmed received</dt><dd>{p.acknowledged_at ? <><LocalTime iso={p.acknowledged_at as string} /> · signed as &ldquo;{p.ack_name as string}&rdquo;</> : p.require_ack ? "Not yet" : "Not asked"}</dd>
        </dl>
      </section>
      <section className="panel">
        <h2>Documents · {opened} of {(items ?? []).length} opened</h2>
        <table className="table">
          <thead><tr><th>Document</th><th>Kind</th><th>First opened</th><th>Opens</th></tr></thead>
          <tbody>
            {(items ?? []).map((i) => (
              <tr key={i.id as string}>
                <td>{i.document_id ? <Link className="link" href={`/documents/${i.document_id}`}>{i.title as string}</Link> : i.title as string}</td>
                <td>{String(i.category).replace(/_/g, " ")}</td>
                <td>{i.first_opened_at ? <LocalTime iso={i.first_opened_at as string} /> : "Not yet"}</td>
                <td>{i.open_count as number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {canEdit && open && !writeBlockReason() && (
        <section className="panel">
          <h2>Link</h2>
          <p className="small">Cancelling stops the personal link from working. You can send a new package any time.</p>
          <ActionForm action={cancelOnboarding} fields={{ id }} label="Cancel link" busy="Cancelling…" quiet confirm="Cancel this link? It will stop working." />
        </section>
      )}
    </>
  );
}
