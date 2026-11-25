"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function SelftapeUploader({ token, maxMb, allowLinks, left }: { token: string; maxMb: number; allowLinks: boolean; left: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; done?: string }>({});
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const router = useRouter();

  async function complete(payload: Record<string, string>) {
    const r = await fetch(`/api/selftape/${token}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, note }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!j.ok) throw new Error(j.error ?? "Something went wrong. Try again.");
  }

  async function upload() {
    const file = input.current?.files?.[0];
    if (!file) return setMsg({ error: "Choose your video first." });
    if (file.size > maxMb * 1048576) return setMsg({ error: `That file is over ${maxMb} MB. Paste a Vimeo, YouTube or Drive link instead.` });
    setBusy(true); setMsg({});
    try {
      const r = await fetch(`/api/selftape/${token}/upload-url`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size }) });
      const t = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; path?: string; token?: string; contentType?: string };
      if (!t.ok || !t.path || !t.token) throw new Error(t.error ?? "The upload couldn't start.");
      const { error } = await createBrowserSupabase().storage.from("selftapes").uploadToSignedUrl(t.path, t.token, file, { contentType: t.contentType });
      if (error) throw new Error("The upload was interrupted. Check your connection and try again.");
      await complete({ path: t.path });
      if (input.current) input.current.value = "";
      setMsg({ done: "Received. Thank you! You'll get a confirmation email." });
      router.refresh();
    } catch (e) {
      setMsg({ error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function sendLink() {
    if (!/^https:\/\//i.test(link.trim())) return setMsg({ error: "Paste an https:// link to your video." });
    setBusy(true); setMsg({});
    try {
      await complete({ link: link.trim() });
      setLink("");
      setMsg({ done: "Received. Thank you! You'll get a confirmation email." });
      router.refresh();
    } catch (e) {
      setMsg({ error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {msg.error && <p className="msg error" role="alert">{msg.error}</p>}
      {msg.done && <p className="msg" role="status">{msg.done}</p>}
      <label className="field"><span>Your video (MP4, MOV, WEBM or M4V, up to {maxMb} MB)</span>
        <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v,.pdf" disabled={busy} />
      </label>
      <label className="field"><span>Note (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Scene 2, take 3" /></label>
      <button className="btn" type="button" onClick={upload} disabled={busy}>{busy ? "Uploading… keep this page open" : "Upload self-tape"}</button>
      {allowLinks && (
        <>
          <p className="small" style={{ marginTop: 18 }}>Or share a link (Vimeo, YouTube unlisted, Google Drive, Dropbox, WeTransfer):</p>
          <label className="field"><span>Video link</span><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" disabled={busy} /></label>
          <button className="btn btn-quiet" type="button" onClick={sendLink} disabled={busy}>Send link</button>
        </>
      )}
      <p className="small">{left} more {left === 1 ? "file" : "files"} allowed.</p>
    </div>
  );
}
