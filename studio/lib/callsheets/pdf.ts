// The call sheet as a PDF in the house style (black and gold header).
// Pure code apart from reading the bundled fonts.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { BLACK, CREAM, GOLD, GOLD_PRINT, INK, MUTED, RULE, drawSpaced, fontBytes, winAnsi, wrap } from "../contracts/pdf.ts";
import { dateLabel, groupEntries, timeLabel, type Sheet } from "./sheet.ts";

const W = 612, H = 792, M = 44;

export async function buildCallSheetPdf(s: Sheet, o: { generatedAt?: Date; highlightEntryId?: string | null } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const spartan = await doc.embedFont(fontBytes().spartan, { subset: true });
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const at = o.generatedAt ?? new Date();
  doc.setTitle(winAnsi(`${s.production} · Call sheet · ${s.title} · ${s.shootDate}`));
  doc.setAuthor("BLEUSKM Studios");
  doc.setProducer("BLEUSKM Studio OS");
  doc.setCreator("BLEUSKM Studio OS");
  doc.setCreationDate(at);
  doc.setModificationDate(at);

  let page: PDFPage = doc.addPage([W, H]);
  const pages: PDFPage[] = [page];
  let y = 0;

  const header = (first: boolean) => {
    const bandH = first ? 112 : 40;
    page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: BLACK });
    page.drawRectangle({ x: 0, y: H - bandH - 2, width: W, height: 2, color: GOLD });
    drawSpaced(page, "BLEUSKM STUDIOS", { x: M, y: H - (first ? 34 : 25), size: 8.5, font: spartan, color: GOLD }, 2.4);
    if (first) {
      drawSpaced(page, "CALL SHEET", { x: M, y: H - 52, size: 8, font: spartan, color: CREAM }, 1.6);
      page.drawText(winAnsi(s.production).slice(0, 48), { x: M, y: H - 86, size: 24, font: spartan, color: rgb(1, 1, 1) });
      const right1 = winAnsi(s.title), right2 = winAnsi(dateLabel(s.shootDate));
      page.drawText(right1, { x: W - M - spartan.widthOfTextAtSize(right1, 14), y: H - 70, size: 14, font: spartan, color: GOLD });
      page.drawText(right2, { x: W - M - serif.widthOfTextAtSize(right2, 10), y: H - 88, size: 10, font: serif, color: CREAM });
    } else {
      const t = winAnsi(`${s.production} · ${s.title} · ${s.shootDate}`);
      page.drawText(t, { x: W - M - serif.widthOfTextAtSize(t, 8), y: H - 25, size: 8, font: serif, color: CREAM });
    }
    y = H - bandH - 22;
  };
  const newPage = () => { page = doc.addPage([W, H]); pages.push(page); header(false); };
  const need = (h: number) => { if (y - h < M + 24) newPage(); };
  const label = (t: string, x = M) => drawSpaced(page, t.toUpperCase(), { x, y, size: 7, font: spartan, color: GOLD_PRINT }, 1.3);
  const block = (title: string, text: string | null, x: number, width: number): number => {
    // Returns the height used (for side-by-side blocks).
    if (!text) return 0;
    const lines = wrap(winAnsi(text), serif, 10, width);
    const start = y;
    label(title, x);
    let yy = y - 14;
    for (const l of lines) { page.drawText(l, { x, y: yy, size: 10, font: serif, color: INK }); yy -= 13; }
    return start - yy;
  };

  header(true);

  // Times bar
  const cells: [string, string][] = [
    ["General call", timeLabel(s.generalCall) || "TBC"],
    ["Crew call", timeLabel(s.crewCall) || timeLabel(s.generalCall) || "TBC"],
    ["Sunrise / sunset", [s.sunrise, s.sunset].filter(Boolean).join(" / ") || "-"],
    ["Weather", s.weather ?? "-"],
  ];
  const cw = (W - 2 * M) / cells.length;
  page.drawRectangle({ x: M, y: y - 46, width: W - 2 * M, height: 56, borderColor: RULE, borderWidth: 0.8, color: rgb(0.985, 0.975, 0.95) });
  cells.forEach(([k, v], i) => {
    const x = M + 12 + i * cw;
    drawSpaced(page, k.toUpperCase(), { x, y: y - 4, size: 6.5, font: spartan, color: GOLD_PRINT }, 1.1);
    const big = i < 2;
    const size = big ? 17 : 10;
    const text = wrap(winAnsi(v), big ? sansBold : serif, size, cw - 18)[0] ?? "";
    page.drawText(text, { x, y: y - (big ? 30 : 24), size, font: big ? sansBold : serif, color: INK });
  });
  y -= 72;

  // Location | Hospital & safety, side by side
  const half = (W - 2 * M - 24) / 2;
  need(60);
  const used1 = block("Location", s.location, M, half);
  const used2 = block("Nearest hospital", s.hospital, M + half + 24, half);
  y -= Math.max(used1, used2) + (used1 || used2 ? 10 : 0);
  const pairs: [string, string | null, string, string | null][] = [
    ["Parking", s.parking, "Safety", s.safety],
    ["Key contacts", s.keyContacts, "", null],
  ];
  for (const [t1, v1, t2, v2] of pairs) {
    if (!v1 && !v2) continue;
    const est = Math.max(wrap(winAnsi(v1 ?? ""), serif, 10, half).length, wrap(winAnsi(v2 ?? ""), serif, 10, half).length) * 13 + 20;
    need(est);
    let a = 0, b = 0;
    if (v1 && v2) { a = block(t1, v1, M, half); b = block(t2, v2, M + half + 24, half); }
    else a = block(v1 ? t1 : t2, v1 ?? v2, M, W - 2 * M);
    y -= Math.max(a, b) + 10;
  }

  // Day schedule
  if (s.schedule) {
    need(40);
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.6, color: RULE });
    y -= 6;
    label("Day schedule");
    y -= 14;
    for (const l of wrap(winAnsi(s.schedule), serif, 10, W - 2 * M)) { need(13); page.drawText(l, { x: M, y, size: 10, font: serif, color: INK }); y -= 13; }
    y -= 8;
  }

  // Call times
  const col = { name: M, pos: M + 170, call: M + 340, notes: M + 405 };
  for (const g of groupEntries(s.entries)) {
    need(48);
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.6, color: RULE });
    y -= 6;
    label(`${g.label} · ${g.rows.length}`);
    y -= 16;
    for (const [k, x] of [["Name", col.name], ["Position", col.pos], ["Call", col.call], ["Notes", col.notes]] as const) {
      page.drawText(k, { x, y, size: 7.5, font: sansBold, color: MUTED });
    }
    y -= 13;
    for (const e of g.rows) {
      const notes = wrap(winAnsi(e.notes ?? ""), sans, 8.5, W - M - col.notes);
      const h = Math.max(1, notes.length) * 11 + 5;
      need(h);
      if (o.highlightEntryId === e.id) page.drawRectangle({ x: M - 4, y: y - h + 9, width: W - 2 * M + 8, height: h, color: rgb(0.99, 0.95, 0.82) });
      const fit = (t: string, f: PDFFont, size: number, w: number) => { let x = winAnsi(t); while (x && f.widthOfTextAtSize(x, size) > w) x = x.slice(0, -1); return x; };
      page.drawText(fit(e.name, sansBold, 9, 162), { x: col.name, y, size: 9, font: sansBold, color: INK });
      page.drawText(fit(e.position ?? "", sans, 9, 162), { x: col.pos, y, size: 9, font: sans, color: INK });
      page.drawText(timeLabel(e.callTime) || timeLabel(e.team === "cast" ? s.generalCall : s.crewCall ?? s.generalCall) || "TBC", { x: col.call, y, size: 9, font: sansBold, color: INK });
      notes.forEach((l, i) => page.drawText(l, { x: col.notes, y: y - i * 11, size: 8.5, font: sans, color: INK }));
      y -= h;
    }
    y -= 6;
  }

  if (s.notes) {
    need(40);
    label("Notes");
    y -= 14;
    for (const l of wrap(winAnsi(s.notes), serif, 10, W - 2 * M)) { need(13); page.drawText(l, { x: M, y, size: 10, font: serif, color: INK }); y -= 13; }
  }

  const stamp = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }).format(at);
  pages.forEach((p, i) => {
    const left = winAnsi(`Confidential · Version ${Math.max(1, s.version)} · Generated ${stamp} CT`);
    p.drawText(left, { x: M, y: 22, size: 7.5, font: serifBold, color: MUTED });
    const r = `Page ${i + 1} of ${pages.length}`;
    p.drawText(r, { x: W - M - serif.widthOfTextAtSize(r, 7.5), y: 22, size: 7.5, font: serif, color: MUTED });
  });
  return doc.save();
}
