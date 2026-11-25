// Self-tapes: file and link rules for the public upload page. Pure code (unit-tested).

export const SELFTAPE_BUCKET = "selftapes";
/** Supabase Free plan limit per file. Raise with STUDIO_SELFTAPE_MAX_MB on Pro. */
export function maxSelftapeBytes(env: Record<string, string | undefined> = {}): number {
  const mb = Number.parseInt(env.STUDIO_SELFTAPE_MAX_MB ?? "", 10);
  return (Number.isFinite(mb) && mb >= 10 && mb <= 5000 ? mb : 50) * 1024 * 1024;
}
export const MAX_SELFTAPE_FILES = 4;

const TYPES: Record<string, string> = {
  mp4: "video/mp4", m4v: "video/x-m4v", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp", pdf: "application/pdf",
};

export function selftapeType(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return TYPES[ext] ?? null;
}

export function safeName(name: string): string {
  const base = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/\.{2,}/g, ".").replace(/^[.-]+/, "");
  return (base || "selftape").slice(-120);
}

export function selftapePath(applicationId: string, invitationId: string, fileName: string, nonce: string): string {
  return `${applicationId}/${invitationId}/${nonce}-${safeName(fileName)}`;
}

export function pathBelongs(path: string, applicationId: string, invitationId: string): boolean {
  const parts = path.split("/");
  return parts.length === 3 && parts[0] === applicationId && parts[1] === invitationId && /^[a-z0-9]{8,32}-[\w.-]{1,130}$/.test(parts[2]);
}

/** A self-tape link (Vimeo, YouTube, Drive, Dropbox, WeTransfer or any https page). */
export function cleanTapeLink(v: string): string | null {
  const s = v.trim();
  if (!s || s.length > 1000 || !/^https:\/\/[^\s<>"']+$/i.test(s)) return null;
  return s;
}

export type InviteState = "open" | "submitted" | "expired" | "cancelled";

/** Whether the upload page accepts files: open until the deadline plus a day's grace. */
export function inviteState(inv: { status: string; deadline: string | null }, now = Date.now()): InviteState {
  if (inv.status === "cancelled") return "cancelled";
  if (inv.status === "expired") return "expired";
  if (inv.deadline && Date.parse(inv.deadline) + 24 * 3600 * 1000 < now) return "expired";
  if (inv.status === "submitted") return "submitted";
  return "open";
}
