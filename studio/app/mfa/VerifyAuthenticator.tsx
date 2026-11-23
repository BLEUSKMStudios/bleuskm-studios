"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function VerifyAuthenticator({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = (data?.totp ?? []).find((f) => f.status === "verified");
    const result = factor ? await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() }) : null;
    setBusy(false);
    if (!result || result.error) return setError("That code didn't work. Use the newest code from the app.");
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={verify}>
      {error && <p className="msg error" role="alert">{error}</p>}
      <label className="field"><span>Code</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus required />
      </label>
      <button className="btn" type="submit" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
    </form>
  );
}
