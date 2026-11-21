import "server-only";

import { loadSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type Person = {
  id: string;
  email: string;
  full_name: string;
  is_owner: boolean;
  status: "active" | "deactivated";
  invitePending: boolean;
  lastSignIn: string | null;
};

/** Everyone with a hub account (owner only: Row Level Security returns just yourself otherwise). */
export async function listPeople(): Promise<Person[]> {
  const { supabase } = await loadSession();
  const { data: profiles } = await supabase.from("profiles").select("id, email, full_name, is_owner, status").order("full_name");
  // Sign-in facts live in Supabase Auth, readable only with the secret key.
  const auth = new Map<string, { confirmed: boolean; last: string | null }>();
  const admin = createAdminClient();
  if (admin) {
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error || !data) break;
      for (const u of data.users) auth.set(u.id, { confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at), last: u.last_sign_in_at ?? null });
      if (data.users.length < 200) break;
    }
  }
  return (profiles ?? []).map((p) => ({
    ...(p as Omit<Person, "invitePending" | "lastSignIn">),
    invitePending: auth.has(p.id) ? !auth.get(p.id)!.confirmed : false,
    lastSignIn: auth.get(p.id)?.last ?? null,
  }));
}
