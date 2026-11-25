import Link from "next/link";
import { randomUUID } from "node:crypto";
import { loadSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/sections";
import { dbCheck, hubContext } from "@/lib/hub/data";
import { zohoConfigured } from "@/lib/hub/zoho";
import { commsSendBlockReason } from "@/lib/hub/env";
import { composeEmail } from "@/lib/hub/comms-actions";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { FromSelect, loadSenders } from "@/components/hub/FromSelect";

export const metadata = { title: "New email · BLEUSKM Studio OS" };

export default async function Compose({ searchParams }: { searchParams: Promise<{ to?: string; contact?: string; from?: string; subject?: string }> }) {
  const { me } = await hubContext();
  if (!me.isOwner && !(await dbCheck(null, "communications", "edit"))) return <NoAccess what="new email (Studio-level Edit access to Communications)" />;
  const sp = await searchParams;
  const { supabase } = await loadSession();
  const senders = await loadSenders(supabase);
  let to = (sp.to ?? "").trim().toLowerCase().slice(0, 254);
  type Person = { id: string; full_name: string; email: string | null };
  let contact: Person | null = null;
  if (sp.contact && isUuid(sp.contact)) {
    const { data } = await supabase.from("contacts").select("id, full_name, email").eq("id", sp.contact).maybeSingle();
    contact = (data as Person | null) ?? null;
    if (contact?.email && !to) to = contact.email;
  }
  const blocked = commsSendBlockReason();
  return (
    <>
      <PageHead title="New email" lead={<><Link className="link" href="/communications?tab=inbox">Communications</Link> · sent through Zoho from a studio address, and kept on the person&apos;s timeline.</>} />
      <section className="panel">
        {!zohoConfigured() && <p className="msg">Zoho Mail isn&apos;t connected yet, so nothing can be sent.</p>}
        {blocked && <p className="msg">{blocked}</p>}
        <HubForm action={composeEmail}>
          <input type="hidden" name="nonce" value={randomUUID()} />
          {contact && <input type="hidden" name="contact_id" value={contact.id} />}
          <FromSelect senders={senders} defaultKey={/^[a-z]+$/.test(sp.from ?? "") ? sp.from! : "studio"} />
          <label className="field wide">
            <span>To{contact ? ` (${contact.full_name})` : ""}</span>
            <input name="to" type="email" required maxLength={254} defaultValue={to} />
          </label>
          <label className="field wide">
            <span>Subject</span>
            <input name="subject" required maxLength={300} defaultValue={(sp.subject ?? "").slice(0, 300)} />
          </label>
          <label className="field wide">
            <span>Message</span>
            <textarea name="body" rows={12} required maxLength={50000} />
          </label>
          <div className="wide form-actions"><Submit busy="Sending…">Send email</Submit></div>
        </HubForm>
      </section>
    </>
  );
}
