"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { attachDocFile, prepareDocUpload } from "@/lib/hub/doc-actions";
import { DOC_ACCEPT, DOC_BUCKET, MAX_DOC_BYTES, docType } from "@/lib/hub/doc-files";

/** Upload a document's file straight to private storage. */
export function DocUpload({ docId }: { docId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; done?: string }>({});

  async function upload() {
    const file = input.current?.files?.[0];
    if (!file) { setMsg({ error: "Choose a file first." }); return; }
    const mime = docType(file.name);
    if (!mime) { setMsg({ error: "That file type can't be stored." }); return; }
    if (file.size > MAX_DOC_BYTES) { setMsg({ error: "Files can be up to 50 MB." }); return; }
    setBusy(true); setMsg({});
    try {
      const ticket = await prepareDocUpload(docId, file.name, file.size);
      if (ticket.error || !ticket.path || !ticket.token) { setMsg({ error: ticket.error ?? "The upload couldn't be started." }); return; }
      const { error } = await createBrowserSupabase().storage.from(DOC_BUCKET).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: mime });
      if (error) { setMsg({ error: "The upload failed. Check your connection and try again." }); return; }
      const r = await attachDocFile(docId, ticket.path, file.name, file.size);
      setMsg(r ?? {});
      if (r?.done) { if (input.current) input.current.value = ""; router.refresh(); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload-row">
      <label className="field"><span>Add the file (PDF, Word, Excel, PowerPoint, text or image, up to 50 MB)</span>
        <input ref={input} type="file" accept={DOC_ACCEPT} disabled={busy} />
      </label>
      <button type="button" className="btn btn-inline" onClick={upload} disabled={busy}>{busy ? "Uploading…" : "Upload"}</button>
      {msg.error && <p className="msg error" role="alert">{msg.error}</p>}
      {msg.done && <p className="msg" role="status">{msg.done}</p>}
    </div>
  );
}
