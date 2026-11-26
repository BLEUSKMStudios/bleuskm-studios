import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext } from "@/lib/hub/data";
import { holdsSection } from "@/lib/hub/nav";
import { writeBlockReason } from "@/lib/hub/env";
import { moduleByKey, isMissingTable } from "@/lib/hub/modules";
import { CATEGORY_LABEL, CONTACT_CATEGORIES, filterHref, readFilter, searchOr } from "@/lib/hub/contacts";
import { formatStudioTime } from "@/lib/hub/casting-core";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { SetupPending } from "@/components/hub/ModuleView";
import { RecordForm } from "@/components/hub/RecordForm";

export const metadata = { title: "Contacts" };

type ContactRow = { id: string; full_name: string; email: string | null; phone: string | null; city: string | null; category: string; tags: string[]; email_status: string; last_activity_at: string | null };
type Audience = { id: string; key: string; name: string; kind: string; marketing: boolean };

// Everyone in one place: applicants, crew, subscribers, clients and vendors,
// one record per person, searchable and filterable by list and tag.
export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { me, grants } = await hubContext();
  if (!me.isOwner && !holdsSection(grants, "contacts")) return <NoAccess what="Contacts" />;
  const f = readFilter(await searchParams);
  const { supabase } = await loadSession();

  const { data: audienceRows, error: audErr } = await supabase.from("audiences").select("id, key, name, kind, marketing").order("marketing", { ascending: false }).order("name");
  if (isMissingTable(audErr?.code)) return <><PageHead title="Contacts" /><section className="panel"><SetupPending what="Contacts" /></section></>;
  const audiences = (audienceRows ?? []) as Audience[];

  let ids: string[] | null = null;
  const aud = audiences.find((a) => a.key === f.audience);
  if (aud) {
    const { data } = await supabase.from("contact_subscriptions").select("contact_id").eq("audience_id", aud.id).eq("status", "subscribed").limit(5000);
    ids = (data ?? []).map((r) => r.contact_id as string);
  }
  let q = supabase.from("contacts").select("id, full_name, email, phone, city, category, tags, email_status, last_activity_at", { count: "exact" }).is("merged_into", null);
  const or = searchOr(f.q);
  if (or) q = q.or(or);
  if (f.category) q = q.eq("category", f.category);
  if (f.tag) q = q.contains("tags", [f.tag]);
  if (ids) q = ids.length ? q.in("id", ids.slice(0, 1000)) : q.eq("id", "00000000-0000-0000-0000-000000000000");
  const { data, count, error } = await q.order("last_activity_at", { ascending: false, nullsFirst: false }).order("full_name").limit(300);
  const rows = (data ?? []) as ContactRow[];

  // Subscriber counts per list (subscribed only).
  const { data: subs } = await supabase.from("contact_subscriptions").select("audience_id").eq("status", "subscribed").limit(10000);
  const counts = new Map<string, number>();
  for (const s of subs ?? []) counts.set(s.audience_id as string, (counts.get(s.audience_id as string) ?? 0) + 1);

  const canEdit = me.isOwner || grants.some((g) => g.section_key === "contacts" && g.production_id === null && g.level === "edit");
  const blocked = writeBlockReason();
  const def = moduleByKey("contacts")!;

  return (
    <>
      <PageHead title="Contacts" lead="Everyone BLEUSKM works with, one record per person: applicants, cast and crew, subscribers, clients and vendors, with every form, email and decision on their timeline." />

      <section className="panel">
        <form className="inline-form" action="/contacts" role="search">
          <label className="field" style={{ flex: "1 1 260px" }}><span>Search</span>
            <input name="q" defaultValue={f.q} placeholder="Name, email, phone, city…" />
          </label>
          <label className="field"><span>Category</span>
            <select name="category" defaultValue={f.category}>
              <option value="">All</option>
              {CONTACT_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field"><span>List</span>
            <select name="audience" defaultValue={f.audience}>
              <option value="">Any</option>
              {audiences.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Tag</span><input name="tag" defaultValue={f.tag} placeholder="e.g. casting-applicant" /></label>
          <button className="btn btn-inline" type="submit">Search</button>
          {(f.q || f.category || f.tag || f.audience) && <Link className="link" href="/contacts">Clear</Link>}
        </form>
      </section>

      <section className="panel">
        <h2>Lists</h2>
        <p className="small">Marketing lists only ever include people who opted in. Applicant and inquiry lists are for messages about that submission only.</p>
        <nav className="filters" aria-label="Lists">
          {audiences.map((a) => (
            <Link key={a.key} className={`chip${f.audience === a.key ? " on" : ""}`} href={filterHref(f, { audience: f.audience === a.key ? "" : a.key })}>
              {a.name} · {counts.get(a.id) ?? 0}{a.marketing ? "" : " (not marketing)"}
            </Link>
          ))}
        </nav>
      </section>

      {canEdit && !blocked && (
        <details className="panel add-panel">
          <summary><span className="btn btn-inline">Add contact</span></summary>
          <RecordForm module="contacts" fields={def.fields} scope="" submitLabel="Add contact" resetOnDone />
        </details>
      )}

      <section className="panel">
        {error ? <p className="msg error" role="alert">Contacts couldn&apos;t be loaded. Refresh to try again.</p> : (
          <>
            <p className="small">{count ?? rows.length} {count === 1 ? "contact" : "contacts"}{rows.length < (count ?? 0) ? ` (showing the ${rows.length} most recently active)` : ""}</p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Category</th><th>Email</th><th>City</th><th>Tags</th><th>Last activity</th></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <th scope="row"><Link href={`/contacts/${c.id}`}>{c.full_name}</Link></th>
                      <td>{CATEGORY_LABEL[c.category] ?? c.category}</td>
                      <td>{c.email}{c.email_status !== "ok" && <span className="tag tag-sm tone-bad">{c.email_status}</span>}</td>
                      <td>{c.city}</td>
                      <td>{c.tags.slice(0, 3).map((t) => <Link key={t} className="tag tag-sm" href={filterHref(f, { tag: t })}>{t}</Link>)}</td>
                      <td className="small">{formatStudioTime(c.last_activity_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="small">No contacts match.</p>}
          </>
        )}
      </section>
    </>
  );
}
