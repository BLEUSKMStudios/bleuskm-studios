// Documents library files: what can be stored and where. Pure code (unit-tested).

import { safeFileName } from "./script-files.ts";

export const DOC_BUCKET = "production-files";
export const MAX_DOC_BYTES = 50 * 1024 * 1024;

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  fountain: "text/plain",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function docType(fileName: string): string | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return ext ? TYPES[ext] ?? null : null;
}
export const DOC_ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(",");

/** documents/<document id>/<time>-<name>: the only place a document's file may live. */
export function docStoragePath(docId: string, fileName: string, now: number = Date.now()): string {
  return `documents/${docId}/${now}-${safeFileName(fileName)}`;
}

export function isDocPath(docId: string, path: string): boolean {
  const prefix = `documents/${docId}/`;
  return path.startsWith(prefix) && /^[A-Za-z0-9._-]{1,200}$/.test(path.slice(prefix.length));
}

/** Kinds of documents that may go in an onboarding package (never contracts, releases, permits or insurance). */
export const SHAREABLE = ["script", "sides", "treatment", "schedule", "rehearsal", "call_sheet", "location_info", "guide", "report", "other"] as const;
export function isShareable(category: string): boolean {
  return (SHAREABLE as readonly string[]).includes(category);
}
