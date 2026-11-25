// Email template rendering for Studio OS. Pure code (unit-tested).
//
// Templates are plain text with {{placeholders}}. A section
// {{#role}} for {{role}}{{/role}} only appears when "role" has a value, so one
// template reads well with or without it. Values are inserted as text; the
// HTML version escapes them.

export type Vars = Record<string, string | null | undefined>;

const SECTION = /\{\{#\s*([a-z_]+)\s*\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/g;
const FIELD = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function render(text: string, vars: Vars): string {
  return text
    .replace(SECTION, (_, k: string, inner: string) => (vars[k] ? inner : ""))
    .replace(FIELD, (_, k: string) => vars[k] ?? "");
}

/** Placeholders used outside optional sections that have no value. */
export function missing(text: string, vars: Vars): string[] {
  const outside = text.replace(SECTION, "");
  const out = new Set<string>();
  for (const m of outside.matchAll(FIELD)) if (!vars[m[1]]) out.add(m[1]);
  return [...out];
}

/** Every placeholder a template mentions. */
export function placeholders(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*[#/]?\s*([a-z_]+)\s*\}\}/g)) out.add(m[1]);
  return [...out];
}

export function firstName(full: string | null | undefined): string {
  const s = (full ?? "").trim();
  return s ? s.split(/\s+/)[0] : "there";
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const LINK = /(https:\/\/[^\s<>"']+[^\s<>"'.,;:!?)])/g;

/**
 * Branded HTML for a plain-text body: paragraphs, line breaks, https links
 * made clickable, an optional preview line, and a footer naming the sender.
 * An unsubscribe link is added for marketing email.
 */
export function toHtml(body: string, opts: { from: string; preview?: string | null; unsubscribeUrl?: string | null }): string {
  const paras = body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(LINK, '<a href="$1" style="color:#8a6a12">$1</a>').replace(/\n/g, "<br>")}</p>`);
  const preview = opts.preview
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preview)}</div>`
    : "";
  const unsub = opts.unsubscribeUrl
    ? ` · <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#888">Unsubscribe</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f6f3ee">${preview}<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1a1a1a;background:#ffffff;border-top:4px solid #DAAF37">${paras.join("")}<p style="margin:24px 0 0;font-size:12px;color:#888">BLEUSKM Studios · ${escapeHtml(opts.from)}${unsub}</p></div></body></html>`;
}

/** The template key used for an automatic confirmation of a website form. */
export function confirmationKey(kind: string): string | null {
  switch (kind) {
    case "casting": return "confirm_casting";
    case "crew": return "confirm_crew";
    case "newsletter": return "confirm_newsletter";
    case "film_notify": return "confirm_film_notify";
    case "inquiry":
    case "client_inquiry": return "confirm_inquiry";
    default: return null;
  }
}
