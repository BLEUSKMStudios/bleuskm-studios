import "server-only";

import { randomInt, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, isToken } from "@/lib/hub/links";
import { REQUEST_COLS, effectiveStatus, type RequestRow } from "./data.ts";
import { sha256, thaw, type Rendered } from "./render.ts";

export type SignContext = { admin: SupabaseClient; r: RequestRow; agreement: Rendered | null; state: RequestRow["status"] };

/** The agreement behind a personal signing link (server key; only this one agreement). */
export async function agreementByToken(token: string): Promise<SignContext | null> {
  if (!isToken(token)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: r } = await admin.from("contract_requests").select(REQUEST_COLS).eq("token_hash", hashToken(token)).maybeSingle<RequestRow>();
  if (!r || r.status === "draft") return null;
  let state = effectiveStatus(r);
  if (state === "expired" && r.status !== "expired") {
    await admin.from("contract_requests").update({ status: "expired" }).eq("id", r.id).in("status", ["sent", "viewed"]);
    state = "expired";
  }
  return { admin, r, agreement: thaw(r.content_text, r.content_hash), state };
}

export function requestMeta(h: Headers): { ip: string | null; agent: string | null } {
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  return { ip: ip ? ip.slice(0, 100) : null, agent: (h.get("user-agent") ?? "").slice(0, 500) || null };
}

export async function logEvent(admin: SupabaseClient, requestId: string, kind: string, meta: { ip: string | null; agent: string | null }, detail: Record<string, unknown> = {}, who?: string) {
  await admin.from("contract_events").insert({ request_id: requestId, kind, actor: "signer", actor_name: who ?? null, ip: meta.ip, user_agent: meta.agent, detail });
}

const codeHash = (requestId: string, code: string) => sha256(`contract-otp:${requestId}:${code}`);

export const OTP_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

/** A new 6-digit code, unless one was issued in the last minute or too many this hour. */
export async function newCode(admin: SupabaseClient, requestId: string): Promise<{ code: string; id: string } | { error: string }> {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data: recent } = await admin.from("contract_otps").select("created_at").eq("request_id", requestId).gte("created_at", hourAgo).order("created_at", { ascending: false });
  if (recent?.length && Date.now() - Date.parse(recent[0].created_at as string) < 60_000) return { error: "A code was just sent. Please wait a minute before asking for another." };
  if ((recent?.length ?? 0) >= 5) return { error: "Too many codes requested. Please try again in an hour, or reply to our email." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { data, error } = await admin.from("contract_otps").insert({ request_id: requestId, code_hash: codeHash(requestId, code), expires_at: new Date(Date.now() + OTP_MINUTES * 60_000).toISOString() }).select("id").single();
  if (error || !data) return { error: "Couldn't create a code. Please try again." };
  return { code, id: data.id as string };
}

/** Checks a code against the newest unused one. Each wrong try counts. */
export async function checkCode(admin: SupabaseClient, requestId: string, code: string): Promise<{ ok: true; otpId: string } | { ok: false; error: string }> {
  const { data: otp } = await admin.from("contract_otps").select("id, code_hash, expires_at, attempts, used_at").eq("request_id", requestId).is("used_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!otp) return { ok: false, error: "Ask for a code first." };
  if (Date.parse(otp.expires_at as string) < Date.now()) return { ok: false, error: "That code has expired. Ask for a new one." };
  if ((otp.attempts as number) >= OTP_MAX_ATTEMPTS) return { ok: false, error: "Too many wrong tries. Ask for a new code." };
  await admin.from("contract_otps").update({ attempts: (otp.attempts as number) + 1 }).eq("id", otp.id);
  const want = Buffer.from(otp.code_hash as string, "hex");
  const got = Buffer.from(codeHash(requestId, /^\d{6}$/.test(code) ? code : "x"), "hex");
  if (!timingSafeEqual(want, got)) return { ok: false, error: "That code isn't right. Check the latest email from us." };
  return { ok: true, otpId: otp.id as string };
}
