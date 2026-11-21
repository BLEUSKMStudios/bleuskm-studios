"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Enrollment = { factorId: string; qr: string; secret: string };

export function EnrollAuthenticator() {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    (async () => {
      // Clear any half-finished setup from an earlier visit, then start fresh.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
      if (error || !data) return setError("Setup couldn't start. Reload the page to try again.");
      setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollment) return;
    setBusy(true);
    setError(null);
    const { error } = await createBrowserSupabase().auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code: code.trim() });
    setBusy(false);
    if (error) return setError("That code didn't work. Check the time on your phone and use the newest code.");
    router.replace("/");
    router.refresh();
  }

  if (!enrollment) return <p className="msg" role="status">{error ?? "Preparing…"}</p>;
  return (
    <form onSubmit={verify}>
      <p className="small">1. Scan this code with your authenticator app.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enrollment.qr} alt="Authenticator setup code" width={200} height={200} style={{ background: "#fff", padding: 8, display: "block", margin: "8px 0 8px" }} />
      <p className="small">Can't scan it? Enter this key instead: <code style={{ wordBreak: "break-all" }}>{enrollment.secret}</code></p>
      <p className="small">2. Enter the 6-digit code the app shows.</p>
      {error && <p className="msg error" role="alert">{error}</p>}
      <label className="field"><span>Code</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
      </label>
      <button className="btn" type="submit" disabled={busy}>{busy ? "Checking…" : "Turn on two-step sign-in"}</button>
    </form>
  );
}
