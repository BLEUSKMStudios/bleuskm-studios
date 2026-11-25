import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { hubContext } from "@/lib/hub/data";
import { saveSender } from "@/lib/hub/comms-actions";
import type { IdentityRow } from "@/lib/hub/mail-rules";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { HubForm, Submit } from "@/components/hub/HubForm";
import { LocalTime } from "@/components/hub/LocalTime";

export const metadata = { title: "Email senders · BLEUSKM Studio OS" };

const KINDS: [IdentityRow["zoho_kind"], string][] = [
  ["unverified", "Not checked yet"],
  ["mailbox", "Its own mailbox"],
  ["alias", "An alias of another mailbox"],
  ["group", "A group address"],
  ["forwarding", "Forwards somewhere else"],
];

// Owner only. Nothing here is assumed: each address is marked once the owner
// has checked it in Zoho (Mail Settings, Mail accounts / Send mail as) and in
// Brevo (Senders, domains & dedicated IPs).
export default async function Senders() {
  const { me } = await hubContext();
  if (!me.isOwner) return <NoAccess what="Email senders" />;
  const { supabase } = await loadSession();
  const { data } = await supabase.from("email_identities").select("key, address, display_name, reply_to, purpose, zoho_kind, brevo_verified, zoho_send_as, verified_at, notes, verified_by, profiles:verified_by (full_name)").order("address");
  const rows = (data ?? []) as unknown as (IdentityRow & { profiles: { full_name: string } | null })[];
  return (
    <>
      <PageHead title="Email senders" lead={<><Link className="link" href="/settings">Settings</Link> · what each studio address is, checked by you. Studio OS only sends from an address once it&apos;s marked here.</>} />
      <section className="panel">
        <p className="small">
          <strong>Brevo verified</strong>: the address is a verified sender in Brevo (automatic confirmations, call sheets, contracts, campaigns).
          {" "}<strong>Zoho send as</strong>: Zoho lets the studio account send as this address (replies and new emails from the inbox).
          In Zoho Mail, look under Settings, Mail accounts and Send mail as; whether it is its own mailbox, an alias or a group shows there.
        </p>
      </section>
      {rows.map((r) => (
        <section className="panel" key={r.key} data-sender={r.key}>
          <h2>{r.address}</h2>
          <p className="small">{r.purpose}</p>
          <HubForm action={saveSender}>
            <input type="hidden" name="key" value={r.key} />
            <label className="field">
              <span>In Zoho, this address is</span>
              <select name="zoho_kind" defaultValue={r.zoho_kind}>
                {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <fieldset className="field">
              <legend>Confirmed</legend>
              <label className="check"><input type="checkbox" name="brevo_verified" defaultChecked={r.brevo_verified} /> Brevo verified sender</label>
              <label className="check"><input type="checkbox" name="zoho_send_as" defaultChecked={r.zoho_send_as} /> Zoho can send as it</label>
            </fieldset>
            <label className="field wide">
              <span>Notes</span>
              <textarea name="notes" rows={2} maxLength={2000} defaultValue={r.notes ?? ""} />
            </label>
            <div className="wide form-actions">
              <Submit>Save {r.key}@</Submit>
              <span className="small">{r.verified_at ? <>Last confirmed <LocalTime iso={r.verified_at} />{r.profiles?.full_name ? ` by ${r.profiles.full_name}` : ""}.</> : "Never confirmed in Studio OS."}</span>
            </div>
          </HubForm>
        </section>
      ))}
    </>
  );
}
