// Script library files: which files are accepted and where they are stored.
// Pure code (unit-tested). Studio OS stores and serves files only; it never
// opens, edits or generates screenplay content.

export const SCRIPT_BUCKET = "production-files";
export const MAX_SCRIPT_BYTES = 50 * 1024 * 1024;

export type ScriptFormat = { ext: "pdf" | "fountain"; mime: "application/pdf" | "text/plain"; label: string };

/** PDF and Fountain (.fountain, Fountainhead's plain-text screenplay format). */
export function scriptFormat(fileName: string): ScriptFormat | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "pdf") return { ext: "pdf", mime: "application/pdf", label: "PDF" };
  if (ext === "fountain") return { ext: "fountain", mime: "text/plain", label: "Fountain" };
  return null;
}

/** A storage-safe version of the file name (letters, digits, . _ -), keeping the extension. */
export function safeFileName(fileName: string): string {
  const base = fileName.normalize("NFKD").replace(/[^\x00-\x7F]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/\.{2,}/g, ".").replace(/-[.-]*-/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  const out = base.slice(-120) || "file";
  return out;
}

/** scripts/<script id>/<time>-<name>: the only place a script's file may live (the database checks too). */
export function scriptStoragePath(scriptId: string, fileName: string, now: number = Date.now()): string {
  return `scripts/${scriptId}/${now}-${safeFileName(fileName)}`;
}

export function isScriptPath(scriptId: string, path: string): boolean {
  const prefix = `scripts/${scriptId}/`;
  return path.startsWith(prefix) && /^[A-Za-z0-9._-]{1,200}$/.test(path.slice(prefix.length));
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
