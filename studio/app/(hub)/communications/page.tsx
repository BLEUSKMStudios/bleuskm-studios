import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { dbCheck, hubContext } from "@/lib/hub/data";
import { holdsSection } from "@/lib/hub/nav";
import { listInbox, searchInbox, zohoConfigured } from "@/lib/hub/zoho";
import { brevoCampaigns, brevoConfigured, brevoEvents, brevoLists, brevoTemplates } from "@/lib/hub/brevo";
import { ALIASES } from "@/lib/hub/comms";
import { commsSendBlockReason } from "@/lib/hub/env";
import { CAMPAIGN_STATUS } from "@/lib/campaigns/rules";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { LocalTime } from "@/components/hub/LocalTime";

export const metadata = { title: "Communications · BLEUSKM Studio OS" };

const TABS = [
  ["inbox", "Inbox"],
  ["history", "History"],
  ["templates", "Templates"],
  ["campaigns", "Campaigns"],
  ["lists", "Lists"],
  ["addresses", "Addresses"],
] as const;
type Tab = (typeof TABS)[number][0];

function Missing({ what, vars }: { what: string; vars: string[] }) {
  return (
    <div className="empty-state">
      <h3>{what} isn't connected yet</h3>
      <p className="small">Add {vars.map((v, i) => <span key={v}>{i > 0 && " and "}<code>{v}</code></span>)} to the hub's Vercel project (Production), then redeploy.</p>
    </div>
  );
}

// One place for the studio's email: the Zoho inbox, everything sent from Studio
// OS, Brevo templates, campaigns and lists, and what each address is for.
export default async function Communications({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; sent?: string }> }) {
  const { me, grants, productions } = await hubContext();
  if (!me.isOwner && !holdsSection(grants, "communications")) return <NoAccess what="Communications" />;
  const sp = await searchParams;
  const raw = sp.tab;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const tab: Tab = TABS.some(([k]) => k === raw) ? (raw as Tab) : "inbox";
  const studio = me.isOwner || (await dbCheck(null, "communications", "view"));
  const titleOf = (id: string | null) => (id ? productions.find((p) => p.id === id)?.title ?? "—" : "Studio-wide");

  let content: React.ReactNode = null;
  const studioOnly = <div className="empty-state"><h3>Studio-level access needed</h3><p className="small">The studio inbox, templates and campaigns are studio-wide. Ask the owner for Studio-level Communications access.</p></div>;

  if (tab === "inbox") {
    if (!studio) content = studioOnly;
    else if (!zohoConfigured()) content = <Missing what="Zoho Mail" vars={["ZOHO_MAIL_USER", "ZOHO_MAIL_APP_PASSWORD"]} />;
    else {
      const inbox = q ? await searchInbox(q, 50) : await listInbox(40);
      const search = (
        <form className="inline-form" action="/communications" method="get" role="search" style={{ marginBottom: 12 }}>
          <input type="hidden" name="tab" value="inbox" />
          <input name="q" defaultValue={q} placeholder="Search sender, subject or text" aria-label="Search the inbox" maxLength={100} />
          <button className="btn btn-inline btn-quiet" type="submit">Search</button>
          {q && <Link className="link small" href="/communications?tab=inbox">Clear</Link>}
          <Link className="btn btn-inline" href="/communications/compose" style={{ marginLeft: "auto" }}>New email</Link>
        </form>
      );
      content = <>{search}{!inbox.ok ? <p className="msg error" role="alert">{inbox.error}</p>
        : inbox.items.length === 0 ? <div className="empty-state"><p className="small">{q ? `Nothing in the inbox matches “${q}”.` : "The inbox is empty."}</p></div>
        : (
          <ul className="mail-list">
            {inbox.items.map((m) => (
              <li key={m.uid} className={m.unread ? "unread" : undefined}>
                <Link href={`/communications/inbox/${m.uid}`}>
                  <span className="from">{m.from}</span>
                  <span className="small nowrap"><LocalTime iso={m.date} /></span>
                  <span className="subj">{m.alias && m.alias !== "studio@bleuskm.com" ? <span className="tag tag-sm" style={{ marginLeft: 0, marginRight: 8 }}>{m.alias.split("@")[0]}@</span> : null}{m.subject}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}</>;
    }
  } else if (tab === "history") {
    const { supabase } = await loadSession();
    const [{ data: hub }, { data: casting }] = await Promise.all([
      supabase.from("comm_messages").select("id, production_id, channel, direction, from_address, to_addresses, subject, status, sent_by_name, sent_at, source").eq("direction", "outbound").order("sent_at", { ascending: false, nullsFirst: false }).limit(100),
      supabase.from("casting_messages").select("id, production_id, to_email, subject, status, sent_at").order("sent_at", { ascending: false }).limit(100),
    ]);
    const rows = [
      ...(hub ?? []).map((m) => ({ id: `h${m.id}`, at: m.sent_at as string | null, to: m.to_addresses as string, subject: m.subject as string, status: m.status as string, via: m.source ? "Final Hand portal (imported)" : m.channel === "zoho" ? "Zoho" : m.channel === "brevo" ? "Brevo" : "Studio OS", production: m.production_id as string | null })),
      ...(casting ?? []).map((m) => ({ id: `c${m.id}`, at: m.sent_at as string, to: m.to_email as string, subject: m.subject as string, status: m.status as string, via: "Casting (Brevo)", production: m.production_id as string })),
    ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, 150);
    content = rows.length === 0 ? <div className="empty-state"><p className="small">No emails have been sent from Studio OS yet.</p></div> : (
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Subject</th><th>To</th><th>Sent</th><th>Status</th><th>Via</th><th>Production</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.subject || "(no subject)"}</th>
                <td style={{ overflowWrap: "anywhere" }}>{r.to}</td>
                <td className="nowrap"><LocalTime iso={r.at} /></td>
                <td><span className={`tag tone-${r.status === "sent" ? "good" : r.status === "failed" ? "bad" : "muted"}`}>{r.status}</span></td>
                <td>{r.via}</td>
                <td>{titleOf(r.production)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (!studio) {
    content = tab === "addresses" ? null : studioOnly;
  } else if (tab !== "addresses" && !brevoConfigured()) {
    content = <Missing what="Brevo" vars={["BREVO_KEY"]} />;
  } else if (tab === "templates") {
    const [t, ev] = await Promise.all([brevoTemplates(), brevoEvents(7)]);
    content = (
      <>
        <p className="small">Casting and crew email templates are edited per production in <Link className="link" href="/casting">Casting</Link>. These are the Brevo templates used by website forms and automations.</p>
        {!t.ok ? <p className="msg error">{t.error}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Template</th><th>ID</th><th>Subject</th><th>Sender</th><th>Active</th></tr></thead>
              <tbody>
                {(t.data.templates ?? []).map((x) => (
                  <tr key={x.id}><th scope="row">{x.name}</th><td>{x.id}</td><td>{x.subject}</td><td>{x.sender?.email ?? "—"}</td><td>{x.isActive ? <span className="tag tone-good">Active</span> : <span className="tag tone-muted">Off</span>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3 style={{ marginTop: 22 }}>Delivery in the last 7 days</h3>
        {!ev.ok ? <p className="small">{ev.error}</p> : (ev.data.events ?? []).length === 0 ? <p className="small">No transactional email events.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Event</th><th>Recipient</th><th>Subject</th><th>When</th></tr></thead>
              <tbody>
                {(ev.data.events ?? []).slice(0, 50).map((e, i) => (
                  <tr key={i}><th scope="row">{e.event}</th><td style={{ overflowWrap: "anywhere" }}>{e.email}</td><td>{e.subject ?? "—"}</td><td className="nowrap"><LocalTime iso={e.date} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  } else if (tab === "campaigns") {
    const { supabase } = await loadSession();
    const { data: mine } = studio ? await supabase.from("campaigns").select("id, name, subject, status, recipient_count, sent_at, updated_at").order("updated_at", { ascending: false }).limit(100) : { data: [] };
    const c = await brevoCampaigns();
    content = (
      <>
        <div className="panel-head"><h2>Studio OS campaigns</h2>{studio && <Link className="btn btn-inline" href="/communications/campaigns/new">New campaign</Link>}</div>
        <p className="small">Written here, approved by the owner on the exact wording, and sent only to people who opted in. Every email has an unsubscribe link.</p>
        {(mine ?? []).length === 0 ? <div className="empty-state"><p className="small">No campaigns yet.</p></div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Campaign</th><th>Status</th><th>Recipients</th><th>Updated</th></tr></thead>
              <tbody>
                {(mine ?? []).map((x) => {
                  const st = CAMPAIGN_STATUS[x.status as string] ?? { label: x.status, tone: "info" };
                  return (
                    <tr key={x.id as string}>
                      <th scope="row"><Link className="link" href={`/communications/campaigns/${x.id}`}>{x.name as string}</Link><span className="small block">{x.subject as string}</span></th>
                      <td><span className={`tag tone-${st.tone}`}>{st.label}</span></td>
                      <td>{(x.recipient_count as number) || "—"}</td>
                      <td className="nowrap"><LocalTime iso={(x.sent_at ?? x.updated_at) as string} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <h2 style={{ marginTop: 28 }}>Earlier campaigns in Brevo</h2>
        {!c.ok ? <p className="msg error">{c.error}</p> : (c.data.campaigns ?? []).length === 0 ? <div className="empty-state"><p className="small">No campaigns in Brevo.</p></div> : (
      <>
        <p className="small">Read-only history from Brevo.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Campaign</th><th>Status</th><th>Sent</th><th>Delivered</th><th>Opened</th><th>Clicked</th><th>Unsubscribed</th></tr></thead>
            <tbody>
              {(c.data.campaigns ?? []).map((x) => {
                const s = x.statistics?.globalStats ?? {};
                return (
                  <tr key={x.id}>
                    <th scope="row">{x.name}<span className="small block">{x.subject}</span></th>
                    <td><span className={`tag tone-${x.status === "sent" ? "good" : x.status === "draft" ? "info" : "warn"}`}>{x.status}</span></td>
                    <td className="nowrap">{x.sentDate ? <LocalTime iso={x.sentDate} /> : "—"}</td>
                    <td>{s.delivered ?? "—"}</td><td>{s.uniqueViews ?? "—"}</td><td>{s.uniqueClicks ?? "—"}</td><td>{s.unsubscriptions ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
        )}
      </>
    );
  } else if (tab === "lists") {
    const l = await brevoLists();
    content = !l.ok ? <p className="msg error">{l.error}</p> : (
      <>
        <p className="small">Newsletter and announcement lists in Brevo. Website sign-ups keep flowing into Airtable and Brevo as before.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>List</th><th>ID</th><th>Subscribers</th><th>Blocked</th></tr></thead>
            <tbody>
              {(l.data.lists ?? []).map((x) => <tr key={x.id}><th scope="row">{x.name}</th><td>{x.id}</td><td>{x.uniqueSubscribers ?? x.totalSubscribers ?? "—"}</td><td>{x.totalBlacklisted ?? "—"}</td></tr>)}
            </tbody>
          </table>
        </div>
      </>
    );
  }
  if (tab === "addresses") {
    content = (
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Address</th><th>Used for</th><th>Where in Studio OS</th><th>Sent through</th></tr></thead>
          <tbody>
            {ALIASES.map((a) => <tr key={a.email}><th scope="row">{a.email}</th><td>{a.purpose}</td><td>{a.area}</td><td>{a.via}</td></tr>)}
          </tbody>
        </table>
      </div>
    );
  }

  const sendNote = commsSendBlockReason();
  return (
    <>
      <PageHead title="Communications" lead="The studio inbox, everything sent from Studio OS, and Brevo templates, campaigns and lists." />
      <nav className="subtabs" aria-label="Communications">
        {TABS.map(([k, l]) => <Link key={k} href={`/communications?tab=${k}`} className={k === tab ? "on" : undefined} aria-current={k === tab ? "page" : undefined}>{l}</Link>)}
      </nav>
      {tab === "inbox" && studio && zohoConfigured() && sendNote && <p className="small" style={{ marginTop: -8 }}>Replying is switched off. {sendNote.includes("COMMS_SEND_ENABLED") ? "The owner can turn it on with COMMS_SEND_ENABLED=on." : ""}</p>}
      {sp.sent === "1" && tab === "history" && <p className="msg" role="status">Email sent. It&apos;s logged below and on the person&apos;s timeline.</p>}
      <section className="panel">{content}</section>
    </>
  );
}
