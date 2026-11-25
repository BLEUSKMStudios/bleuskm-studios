"use client";

import { useEffect, useRef, useState } from "react";

type Props = { token: string; name: string; email: string; contentHash: string; consent: string; agree: string; expires: string | null };

/** Verify the email, consent, sign (typed or drawn). Mirrors the live agreement's signing block. */
export function SignForm({ token, name, email, contentHash, consent, agree, expires }: Props) {
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [okConsent, setOkConsent] = useState(false);
  const [okAgree, setOkAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawnRef = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c || mode !== "drawn") return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#EADFCF";
    let down = false;
    const pos = (e: PointerEvent) => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top] as const; };
    const start = (e: PointerEvent) => { down = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (e: PointerEvent) => { if (!down) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); drawnRef.current = true; };
    const end = () => { down = false; };
    c.addEventListener("pointerdown", start); c.addEventListener("pointermove", move); c.addEventListener("pointerup", end); c.addEventListener("pointerleave", end);
    return () => { c.removeEventListener("pointerdown", start); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", end); c.removeEventListener("pointerleave", end); };
  }, [mode]);

  const clear = () => { const c = canvas.current; if (c) { c.getContext("2d")!.clearRect(0, 0, c.width, c.height); drawnRef.current = false; } };

  // The drawn signature is saved dark-on-transparent so it prints on white paper.
  const drawing = (): string | null => {
    const c = canvas.current;
    if (!c || !drawnRef.current) return null;
    const out = document.createElement("canvas");
    out.width = c.width; out.height = c.height;
    const o = out.getContext("2d")!;
    o.drawImage(c, 0, 0);
    o.globalCompositeOperation = "source-in"; o.fillStyle = "#111111"; o.fillRect(0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };

  async function sendCode() {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/sign/${token}/code`, { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && data.ok) { setCodeSent(true); setMsg({ text: `We emailed a 6-digit code to ${data.to}. It works for 10 minutes.` }); }
    else setMsg({ error: true, text: data.error ?? "We couldn't send a code. Please try again." });
  }

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const d = mode === "drawn" ? drawing() : null;
    if (mode === "drawn" && !d) { setMsg({ error: true, text: "Please draw your signature." }); return; }
    setBusy(true);
    const res = await fetch(`/api/sign/${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name: typed, kind: mode, drawing: d, consent: okConsent, agree: okAgree, content_hash: contentHash }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && data.ok) setDone(true);
    else setMsg({ error: true, text: data.error ?? "Something went wrong. Please try again." });
  }

  if (done) {
    return (
      <div role="status">
        <p className="ag-step">Signed</p>
        <p className="ag-text">Thank you, {name.split(/\s+/)[0]}. Your agreement is signed. A PDF copy with its signing certificate is on its way to {email}.</p>
      </div>
    );
  }

  return (
    <form onSubmit={sign} className="ag-noprint">
      <p className="ag-step">Step 1 · Confirm your email</p>
      <p className="ag-text" style={{ fontSize: 13 }}>To sign, enter the one-time code we email to {email}.</p>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", margin: "10px 0 18px" }}>
        <button type="button" className="ag-btn ag-btn-quiet" onClick={sendCode} disabled={busy}>{codeSent ? "Send a new code" : "Email me a code"}</button>
        {codeSent && (
          <label className="ag-field" style={{ margin: 0, flex: "1 1 140px" }}><span>6-digit code</span>
            <input className="ag-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
          </label>
        )}
      </div>

      <p className="ag-step">Step 2 · Sign</p>
      <div className="ag-tabs" role="group" aria-label="Signature type">
        <button type="button" className="ag-tab" aria-pressed={mode === "typed"} onClick={() => setMode("typed")}>Type</button>
        <button type="button" className="ag-tab" aria-pressed={mode === "drawn"} onClick={() => setMode("drawn")}>Draw</button>
      </div>
      {mode === "drawn" && (
        <div style={{ marginBottom: 12 }}>
          <canvas ref={canvas} className="ag-canvas" aria-label="Draw your signature" />
          <button type="button" className="ag-link" onClick={clear}>Clear</button>
        </div>
      )}
      <label className="ag-field"><span>Your full legal name{mode === "typed" ? " (this is your signature)" : ""}</span>
        <input className={`ag-input${mode === "typed" ? " ag-input-sig" : ""}`} style={mode === "typed" ? { fontFamily: "var(--font-signature)" } : undefined}
          value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoComplete="name" required maxLength={200} />
      </label>
      <label className="ag-check"><input type="checkbox" checked={okConsent} onChange={(e) => setOkConsent(e.target.checked)} required /><span>{consent}</span></label>
      <label className="ag-check"><input type="checkbox" checked={okAgree} onChange={(e) => setOkAgree(e.target.checked)} required /><span>{agree}</span></label>
      {msg && <p className={`ag-msg${msg.error ? " error" : ""}`} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
      <button className="ag-btn" type="submit" disabled={busy || !codeSent || code.length !== 6 || !okConsent || !okAgree || !typed.trim()}>
        {busy ? "Signing…" : "Sign agreement"}
      </button>
      <p className="ag-note">Today is {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date())}. {expires ? `This link works until ${expires}.` : ""} Your signature, the time, your IP address and browser are recorded with the agreement.</p>
    </form>
  );
}
