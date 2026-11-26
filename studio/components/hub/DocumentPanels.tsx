import Link from "next/link";
import { loadSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBytes } from "@/lib/hub/script-files";
import { DOC_BUCKET } from "@/lib/hub/doc-files";
import { newDocVersion } from "@/lib/hub/doc-actions";
import { ActionForm } from "./ActionForm";
import { DocUpload } from "./DocUpload";

type Row = Record<string, unknown> & { id: string };

/** A document's file (private, opened through a 1-hour link) and its versions. */
export async function DocumentPanels({ row, canEdit, blocked }: { row: Row; canEdit: boolean; blocked: string | null }) {
  const { supabase } = await loadSession();
  const id = row.id;
  // Versions: walk back through what this replaces, and find what replaces it.
  const chain: { id: string; version: number; title: string; created_at: string }[] = [];
  let cursor = row.supersedes_id as string | null;
  for (let i = 0; cursor && i < 20; i++) {
    const { data } = await supabase.from("documents").select("id, version, title, created_at, supersedes_id").eq("id", cursor).maybeSingle();
    if (!data) break;
    chain.push(data as never);
    cursor = data.supersedes_id as string | null;
  }
  const { data: newer } = await supabase.from("documents").select("id, version").eq("supersedes_id", id).maybeSingle();
  let url: string | null = null;
  if (row.storage_path) {
    const { data } = await createAdminClient()!.storage.from(DOC_BUCKET).createSignedUrl(String(row.storage_path), 3600);
    url = data?.signedUrl ?? null;
  }
  const { data: sends } = await supabase.from("onboarding_items").select("id, first_opened_at, open_count, onboarding_packages(id, recipient_name, sent_at, status)").eq("document_id", id).limit(100);
  return (
    <>
      <section className="panel">
        <h2>File · version {String(row.version ?? 1)}</h2>
        {newer && <p className="msg warn">A newer version exists: <Link className="link" href={`/documents/${newer.id}`}>version {newer.version}</Link>.</p>}
        {row.storage_path ? (
          <p>{url ? <a className="link" href={url} target="_blank" rel="noopener noreferrer">{String(row.file_name ?? "Open file")}</a> : "File unavailable"} <span className="small">· {formatBytes(row.size_bytes as number)} · stored privately, link valid 1 hour</span></p>
        ) : <p className="small">No file stored{row.drive_url ? " (it's linked in Google Drive)" : ""}.</p>}
        {canEdit && !blocked && row.source !== "contract" && !row.storage_path && <DocUpload docId={id} />}
        {canEdit && !blocked && row.source !== "contract" && !newer && row.storage_path ? (
          <ActionForm action={newDocVersion} fields={{ id }} label="Add a new version" busy="Creating…" quiet />
        ) : null}
        {chain.length > 0 && (
          <><h3>Earlier versions</h3><ul className="plain">{chain.map((c) => <li key={c.id}><Link className="link" href={`/documents/${c.id}`}>Version {c.version}</Link></li>)}</ul></>
        )}
      </section>
      {(sends ?? []).length > 0 && (
        <section className="panel">
          <h2>Sent in onboarding packages</h2>
          <ul className="plain">
            {(sends ?? []).map((s) => {
              const p = s.onboarding_packages as unknown as { id: string; recipient_name: string; sent_at: string | null; status: string } | null;
              return p ? <li key={s.id as string}><Link className="link" href={`/onboarding/${p.id}`}>{p.recipient_name}</Link> · {s.first_opened_at ? `opened ${s.open_count}×` : "not opened yet"} · {p.status}</li> : null;
            })}
          </ul>
        </section>
      )}
    </>
  );
}
