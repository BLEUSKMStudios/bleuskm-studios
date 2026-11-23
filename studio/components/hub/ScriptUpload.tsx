"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { attachScriptFile, prepareScriptUpload } from "@/lib/hub/script-actions";
import { MAX_SCRIPT_BYTES, SCRIPT_BUCKET, scriptFormat } from "@/lib/hub/script-files";

/** Upload a PDF or Fountain file to a script record (replaces its current file link; earlier files are kept). */
export function ScriptUpload({ scriptId, hasFile }: { scriptId: string; hasFile: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; done?: string }>({});

  async function upload() {
    const file = input.current?.files?.[0];
    if (!file) { setMsg({ error: "Choose a file first." }); return; }
    const format = scriptFormat(file.name);
    if (!format) { setMsg({ error: "Only PDF (.pdf) and Fountain (.fountain) files can be added." }); return; }
    if (file.size > MAX_SCRIPT_BYTES) { setMsg({ error: "Files can be up to 50 MB." }); return; }
    setBusy(true); setMsg({});
    try {
      const ticket = await prepareScriptUpload(scriptId, file.name, file.size);
      if (ticket.error || !ticket.path || !ticket.token) { setMsg({ error: ticket.error ?? "The upload couldn't be started." }); return; }
      const { error } = await createBrowserSupabase().storage.from(SCRIPT_BUCKET).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: format.mime });
      if (error) { setMsg({ error: "The upload failed. Check your connection and try again." }); return; }
      const r = await attachScriptFile(scriptId, ticket.path, file.name, file.size);
      setMsg(r ?? {});
      if (r?.done) { if (input.current) input.current.value = ""; router.refresh(); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload-row">
      <label className="field">
        <span>{hasFile ? "Replace with a new file" : "Add the file"} (PDF or Fountain, up to 50 MB)</span>
        <input ref={input} type="file" accept=".pdf,.fountain,application/pdf" disabled={busy} />
      </label>
      <button type="button" className="btn btn-inline" onClick={upload} disabled={busy}>{busy ? "Uploading…" : "Upload"}</button>
      {msg.error && <p className="msg error" role="alert">{msg.error}</p>}
      {msg.done && <p className="msg" role="status">{msg.done}</p>}
      {hasFile && <p className="small">The earlier file stays stored. For a new draft, add a new record and set “Replaces” so the version history stays complete.</p>}
    </div>
  );
}
