"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { passwordProblem } from "./decide.ts";

export type FormState = { error?: string; done?: string } | undefined;

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = text(form.get("email")).toLowerCase();
  const password = typeof form.get("password") === "string" ? (form.get("password") as string) : "";
  if (!email || !password) return { error: "Enter your email and password." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // One message for every failure, so the form never reveals which emails have accounts.
  if (error) return { error: "That email and password don't match an active account." };
  redirect("/");
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = text(form.get("email")).toLowerCase();
  if (!email || !email.includes("@")) return { error: "Enter your email address." };
  const supabase = await createServerSupabase();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm?next=/set-password` });
  // Same answer whether or not the address has an account.
  return { done: "If that address has a Studio OS account, a reset link is on its way. It works once and expires after an hour." };
}

export async function setPassword(_: FormState, form: FormData): Promise<FormState> {
  const password = typeof form.get("password") === "string" ? (form.get("password") as string) : "";
  const confirm = typeof form.get("confirm") === "string" ? (form.get("confirm") as string) : "";
  const problem = passwordProblem(password, confirm);
  if (problem) return { error: problem };
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "This link has expired. Ask for a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "That password couldn't be saved. Try a different one." };
  redirect("/");
}
