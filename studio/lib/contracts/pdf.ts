// The signed agreement as a PDF: the house design (black and gold header,
// numbered sections, both signatures) followed by a signing certificate with
// the audit trail. Pure code apart from reading the bundled fonts.
//
// The PDF is generated once, at signing, from the frozen wording; its SHA-256
// is stored with the agreement so any copy can be checked later.

import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Rendered } from "./render.ts";

export type PdfSignature = {
  name: string;
  title?: string;
  kind: "typed" | "drawn" | "image";
  png?: Uint8Array | null;
  at: string; // ISO time
};

export type PdfEvent = { at: string; kind: string; actor: string; who?: string | null; ip?: string | null };

export type PdfInput = {
  agreement: Rendered;
  contentHash: string;
  studio: PdfSignature;
  signer: PdfSignature & { email: string };
  certificate: {
    verifiedAt: string;
    consentAt: string;
    consentText: string;
    ip: string | null;
    userAgent: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    sentFrom: string;
    events: PdfEvent[];
    chainHead: string | null;
  };
};

const W = 612, H = 792, M = 60;
const BLACK = rgb(0.031, 0.031, 0.031);
const GOLD = rgb(0.855, 0.686, 0.216);     // #DAAF37 (on black)
const GOLD_PRINT = rgb(0.62, 0.48, 0.12);  // darker gold for white paper
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.38, 0.38, 0.38);
const RULE = rgb(0.85, 0.82, 0.74);
const CREAM = rgb(0.918, 0.875, 0.812);    // #EADFCF

let fontCache: { spartan: Uint8Array; script: Uint8Array } | null = null;
function fontBytes() {
  if (!fontCache) {
    const dir = path.join(process.cwd(), "lib", "contracts", "fonts");
    fontCache = {
      spartan: readFileSync(path.join(dir, "LeagueSpartan-Bold.ttf")),
      script: readFileSync(path.join(dir, "DancingScript-SemiBold.ttf")),
    };
  }
  return fontCache;
}

// The standard PDF fonts only cover Windows-1252. Anything else (rare in
// names) is shown as "?" in the PDF; the exact text stays in the record.
const WIN_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
export function winAnsi(s: string): string {
  return [...s.normalize("NFC")].map((ch) => {
    const c = ch.codePointAt(0)!;
    if (ch === "\n" || (c >= 0x20 && c < 0x7f) || (c >= 0xa0 && c <= 0xff) || WIN_EXTRA.has(ch)) return ch;
    if (c === 0x2212) return "-";
    return "?";
  }).join("");
}

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (let w of words) {
      while (font.widthOfTextAtSize(w, size) > width) {
        // A very long word (a URL or hash): break it.
        let i = w.length - 1;
        while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
        if (line) { out.push(line); line = ""; }
        out.push(w.slice(0, i));
        w = w.slice(i);
      }
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width) { out.push(line); line = w; } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

const fmt = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const ct = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", dateStyle: "long", timeStyle: "long" }).format(d);
  return `${ct} (${d.toISOString().replace(/\.\d{3}Z$/, "Z")})`;
};
const day = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", dateStyle: "long" }).format(new Date(iso));

type TextOpts = { x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> };
/** Letter-spaced capitals, as in the BLEUSKM headings. */
function drawSpaced(p: PDFPage, t: string, o: TextOpts, spacing: number) {
  let x = o.x;
  for (const ch of t) {
    p.drawText(ch, { ...o, x });
    x += o.font.widthOfTextAtSize(ch, o.size) + spacing;
  }
}

export async function buildSignedPdf(input: PdfInput): Promise<Uint8Array> {
  const a = input.agreement;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fb = fontBytes();
  const spartan = await doc.embedFont(fb.spartan, { subset: true });
  const script = await doc.embedFont(fb.script, { subset: true });
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  doc.setTitle(winAnsi(`${a.title} — ${a.signer.name}`));
  doc.setAuthor("BLEUSKM Studios");
  doc.setSubject(winAnsi(`${a.template.name} (v${a.template.version}) · ${a.production}`));
  doc.setProducer("BLEUSKM Studio OS");
  doc.setCreator("BLEUSKM Studio OS");
  doc.setKeywords([`agreement:${a.agreementId}`, `sha256:${input.contentHash}`]);
  doc.setCreationDate(new Date(input.signer.at));
  doc.setModificationDate(new Date(input.signer.at));

  let page: PDFPage = doc.addPage([W, H]);
  let y = 0;
  const pages: PDFPage[] = [page];

  const header = (first: boolean) => {
    const bandH = first ? 132 : 44;
    page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: BLACK });
    page.drawRectangle({ x: 0, y: H - bandH - 2, width: W, height: 2, color: GOLD });
    drawSpaced(page, "BLEUSKM STUDIOS", { x: M, y: H - (first ? 40 : 27), size: 9, font: spartan, color: GOLD }, 2.5);
    if (first) {
      drawSpaced(page, a.docLabel.toUpperCase(), { x: M, y: H - 58, size: 8, font: spartan, color: CREAM }, 1.5);
      page.drawText(a.title, { x: M, y: H - 98, size: 28, font: spartan, color: rgb(1, 1, 1) });
      page.drawText(winAnsi(a.production), { x: M, y: H - 118, size: 10, font: serif, color: CREAM });
    } else {
      const t = winAnsi(`${a.title} · ${a.signer.name}`);
      page.drawText(t, { x: W - M - serif.widthOfTextAtSize(t, 8), y: H - 27, size: 8, font: serif, color: CREAM });
    }
    y = H - bandH - 30;
  };
  const newPage = () => { page = doc.addPage([W, H]); pages.push(page); header(false); };
  const need = (h: number) => { if (y - h < M + 30) newPage(); };
  const para = (text: string, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number; lead?: number } = {}) => {
    const font = o.font ?? serif, size = o.size ?? 10.5, lead = o.lead ?? size * 1.42, x = M + (o.indent ?? 0);
    for (const l of wrap(winAnsi(text), font, size, W - M - x)) {
      need(lead);
      page.drawText(l, { x, y, size, font, color: o.color ?? INK });
      y -= lead;
    }
    y -= o.gap ?? 0;
  };

  header(true);

  // Party bar
  const cols = Math.min(a.party.length, 4);
  const colW = (W - 2 * M) / cols;
  const rows = Math.ceil(a.party.length / cols);
  const barH = rows * 40 + 12;
  page.drawRectangle({ x: M, y: y - barH + 12, width: W - 2 * M, height: barH, borderColor: RULE, borderWidth: 0.8, color: rgb(0.985, 0.975, 0.95) });
  a.party.forEach((p, i) => {
    const cx = M + 12 + (i % cols) * colW, cy = y - Math.floor(i / cols) * 40;
    drawSpaced(page, p.label.toUpperCase(), { x: cx, y: cy - 6, size: 6.5, font: spartan, color: GOLD_PRINT }, 1.2);
    const v = wrap(winAnsi(p.value), serifBold, 9.5, colW - 18);
    page.drawText(v[0] ?? "", { x: cx, y: cy - 20, size: 9.5, font: serifBold, color: INK });
    if (v[1]) page.drawText(v.length > 2 ? `${v[1].slice(0, -1)}…` : v[1], { x: cx, y: cy - 31, size: 9.5, font: serifBold, color: INK });
  });
  y -= barH + 18;

  // Sections
  for (const c of a.clauses) {
    need(48);
    const num = String(c.n).padStart(2, "0");
    page.drawText(num, { x: M, y, size: 10, font: spartan, color: GOLD_PRINT });
    drawSpaced(page, winAnsi(c.title.toUpperCase()), { x: M + 26, y, size: 10, font: spartan, color: INK }, 1);
    y -= 17;
    para(c.text, { indent: 26, gap: 10 });
  }
  para(a.signNote, { font: serifBold, gap: 14 });

  // Signatures
  need(170);
  page.drawRectangle({ x: M, y: y + 6, width: W - 2 * M, height: 0.8, color: RULE });
  y -= 14;
  const top = y;
  const sigImages: Record<string, PDFImage | null> = {};
  for (const [k, s] of [["studio", input.studio], ["signer", input.signer]] as const) {
    sigImages[k] = s.png && s.kind !== "typed" ? await doc.embedPng(s.png).catch(() => null) : null;
  }
  const block = (x: number, label: string, s: PdfSignature, img: PDFImage | null, extra: string[]) => {
    let yy = top;
    drawSpaced(page, label.toUpperCase(), { x, y: yy, size: 7.5, font: spartan, color: GOLD_PRINT }, 1.4);
    yy -= 52;
    if (img) {
      const scale = Math.min(200 / img.width, 44 / img.height);
      page.drawImage(img, { x, y: yy, width: img.width * scale, height: img.height * scale });
    } else {
      const typed = winAnsi(s.name);
      let size = 24;
      while (size > 12 && script.widthOfTextAtSize(typed, size) > 220) size -= 1;
      page.drawText(typed, { x, y: yy + 8, size, font: script, color: INK });
    }
    yy -= 6;
    page.drawRectangle({ x, y: yy, width: 220, height: 0.7, color: MUTED });
    yy -= 13;
    page.drawText(winAnsi(s.name), { x, y: yy, size: 9.5, font: serifBold, color: INK });
    yy -= 12;
    for (const e of [...(s.title ? [s.title] : []), ...extra, `Signed ${day(s.at)}`]) {
      page.drawText(winAnsi(e), { x, y: yy, size: 8.5, font: serif, color: MUTED });
      yy -= 11;
    }
    return yy;
  };
  const end1 = block(M, "BLEUSKM Studios", input.studio, sigImages.studio, []);
  const end2 = block(W / 2 + 10, a.signerLabel, input.signer, sigImages.signer, [input.signer.email, input.signer.kind === "drawn" ? "Drawn electronic signature" : "Typed electronic signature"]);
  y = Math.min(end1, end2) - 10;

  // Signing certificate
  newPage();
  drawSpaced(page, "SIGNING CERTIFICATE", { x: M, y, size: 14, font: spartan, color: INK }, 1.5);
  y -= 22;
  para("This certificate is part of the signed agreement. It records how the agreement was presented, how the signer was verified, their consent to sign electronically, and every step in its history. Each history entry is chained to the one before it by a SHA-256 hash, so a removed or altered entry is detectable.", { size: 9.5, color: MUTED, gap: 10 });
  const c = input.certificate;
  const kv: [string, string][] = [
    ["Agreement ID", a.agreementId],
    ["Template", `${a.template.name}, version ${a.template.version}`],
    ["Production", a.production],
    ["Agreement text SHA-256", input.contentHash],
    ["Prepared and approved by", c.approvedBy ? `${c.approvedBy}, ${fmt(c.approvedAt)}` : fmt(c.approvedAt)],
    ["Sent from", c.sentFrom],
    ["Signer", `${input.signer.name} <${input.signer.email}>`],
    ["Email verified", `One-time code sent to ${input.signer.email}, entered ${fmt(c.verifiedAt)}`],
    ["Consent to sign electronically", fmt(c.consentAt)],
    ["Signed", fmt(input.signer.at)],
    ["Signature", input.signer.kind === "drawn" ? "Drawn on screen" : "Typed name"],
    ["Signer's IP address", c.ip ?? "not recorded"],
    ["Signer's browser", c.userAgent ?? "not recorded"],
    ["Signed for BLEUSKM Studios by", `${input.studio.name}${input.studio.title ? `, ${input.studio.title}` : ""}`],
  ];
  for (const [k, v] of kv) {
    need(28);
    drawSpaced(page, k.toUpperCase(), { x: M, y, size: 6.8, font: spartan, color: GOLD_PRINT }, 1);
    y -= 11;
    para(v, { font: /SHA-256|ID/.test(k) ? mono : serif, size: /SHA-256|ID/.test(k) ? 8.5 : 9.5, gap: 5 });
  }
  y -= 4;
  need(40);
  drawSpaced(page, "CONSENT THE SIGNER GAVE", { x: M, y, size: 6.8, font: spartan, color: GOLD_PRINT }, 1);
  y -= 11;
  para(c.consentText, { size: 9, gap: 12 });

  need(40);
  drawSpaced(page, "HISTORY", { x: M, y, size: 9, font: spartan, color: INK }, 1.2);
  y -= 15;
  for (const e of c.events) {
    need(24);
    page.drawText(winAnsi(new Date(e.at).toISOString().replace(/\.\d{3}Z$/, "Z")), { x: M, y, size: 7.5, font: mono, color: MUTED });
    page.drawText(winAnsi(e.kind.replace(/_/g, " ")), { x: M + 120, y, size: 8.5, font: serifBold, color: INK });
    const who = [e.actor, e.who, e.ip ? `IP ${e.ip}` : null].filter(Boolean).join(" · ");
    page.drawText(winAnsi(who).slice(0, 80), { x: M + 230, y, size: 8, font: serif, color: MUTED });
    y -= 13;
  }
  if (c.chainHead) {
    y -= 6;
    para(`History chain head (SHA-256): ${c.chainHead}`, { font: mono, size: 7.5, color: MUTED });
  }
  y -= 8;
  para("To check a copy of this PDF, open the agreement in BLEUSKM Studio OS and use Verify a copy: the PDF's own SHA-256 fingerprint is stored with the agreement. Questions: studio@bleuskm.com.", { size: 8.5, color: MUTED });

  // Footers
  const total = pages.length;
  pages.forEach((p, i) => {
    p.drawRectangle({ x: M, y: 44, width: W - 2 * M, height: 0.5, color: RULE });
    p.drawText(winAnsi(`Agreement ${a.agreementId} · ${a.template.key} v${a.template.version} · text SHA-256 ${input.contentHash.slice(0, 16)}…`), { x: M, y: 32, size: 6.8, font: serif, color: MUTED });
    const t = `Page ${i + 1} of ${total}`;
    p.drawText(t, { x: W - M - serif.widthOfTextAtSize(t, 7.5), y: 32, size: 7.5, font: serif, color: MUTED });
  });

  return doc.save({ useObjectStreams: false });
}

/** Signature images: PNG only, sensible size, decoded from a data: URL. */
export function decodeSignaturePng(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length < 100 || bytes.length > 300_000) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((b, i) => bytes[i] === b)) return null;
  return new Uint8Array(bytes);
}
