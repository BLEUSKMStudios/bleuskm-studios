"use server";

import { headers } from "next/headers";
import { requireOwner } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FormState } from "@/lib/auth/actions";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function invitePerson(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner(); // checked again here: a form post can come from anywhere
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const fullName = String(form.get("full_name") ?? "").trim();
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  if (!fullName || fullName.length > 120) return { error: "Enter the person's name." };

  const admin = createAdminClient();
  if (!admin) return { error: "Studio OS isn't connected to its database." };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${origin}/auth/confirm?next=/set-password`,
  });
  if (error) {
    return { error: /already|exists|registered/i.test(error.message) ? "That email already has an account." : "The invitation couldn't be sent. Try again in a minute." };
  }
  // The new person starts with no access. Access is granted in User Access (step 1D).
  return { done: `Invitation sent to ${email}. They start with no access until you grant it.` };
}
