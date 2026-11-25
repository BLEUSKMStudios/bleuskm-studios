import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import type { IdentityRow } from "@/lib/hub/mail-rules";

export type Sender = Pick<IdentityRow, "key" | "address" | "display_name" | "zoho_send_as" | "zoho_kind">;

export async function loadSenders(db: SupabaseClient): Promise<Sender[]> {
  const { data } = await db.from("email_identities").select("key, address, display_name, zoho_send_as, zoho_kind").order("address");
  return (data ?? []) as Sender[];
}

/** The studio addresses that may be used as From in Zoho; the others are shown but can't be picked. */
export function FromSelect({ senders, defaultKey }: { senders: Sender[]; defaultKey: string }) {
  const usable = senders.filter((s) => s.zoho_send_as);
  return (
    <label className="field wide">
      <span>Send from</span>
      <select name="from" defaultValue={usable.some((s) => s.key === defaultKey) ? defaultKey : usable[0]?.key ?? ""}>
        {usable.length === 0 && <option value="">No address is confirmed for sending in Zoho yet</option>}
        {senders.map((s) => (
          <option key={s.key} value={s.key} disabled={!s.zoho_send_as}>
            {s.display_name} &lt;{s.address}&gt;{s.zoho_send_as ? "" : " (not confirmed in Zoho)"}
          </option>
        ))}
      </select>
      {usable.length < senders.length && <span className="small">The owner confirms each address in <Link className="link" href="/settings/senders">Settings, Email senders</Link>.</span>}
    </label>
  );
}
