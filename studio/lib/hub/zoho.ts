import "server-only";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { aliasFor } from "./comms.ts";

// Zoho Mail: the studio inbox (studio@bleuskm.com, which also receives the
// crew@, casting@, films@, newsletter@ and clients@ aliases). Read over IMAP
// and reply over SMTP with an app password. Server-only: credentials never
// reach the browser.

function config() {
  const user = (process.env.ZOHO_MAIL_USER ?? "").trim();
  const pass = (process.env.ZOHO_MAIL_APP_PASSWORD ?? "").trim();
  if (!user || !pass) return null;
  const imapHost = (process.env.ZOHO_IMAP_HOST ?? "").trim() || "imap.zoho.com";
  const smtpHost = (process.env.ZOHO_SMTP_HOST ?? "").trim() || "smtp.zoho.com";
  // Test hook: a mail server on this machine may use other ports without TLS.
  // Never applies to a real (non-local) host, so it can't weaken Zoho.
  const local = (h: string) => h === "127.0.0.1" || h === "localhost";
  const testMode = (process.env.ZOHO_LOCAL_TEST ?? "").trim() === "on";
  const imapLocal = testMode && local(imapHost);
  const smtpLocal = testMode && local(smtpHost);
  return {
    user, pass, imapHost, smtpHost,
    imapPort: imapLocal ? Number(process.env.ZOHO_IMAP_PORT) || 1143 : 993,
    imapSecure: !imapLocal,
    smtpPort: smtpLocal ? Number(process.env.ZOHO_SMTP_PORT) || 1025 : 465,
    smtpSecure: !smtpLocal,
  };
}

export function zohoConfigured(): boolean {
  return config() !== null;
}

export type InboxItem = { uid: number; from: string; fromEmail: string; to: string; subject: string; date: string | null; unread: boolean; alias: string | null };
export type InboxResult = { ok: true; items: InboxItem[] } | { ok: false; error: string };

async function withImap<T>(fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const cfg = config();
  if (!cfg) throw new Error("not_configured");
  const client = new ImapFlow({
    host: cfg.imapHost, port: cfg.imapPort, secure: cfg.imapSecure, auth: { user: cfg.user, pass: cfg.pass },
    logger: false, socketTimeout: 20000, greetingTimeout: 10000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

type Envelope = { uid: number; envelope?: { from?: { name?: string; address?: string }[]; to?: { address?: string }[]; subject?: string; date?: Date | string }; flags?: Set<string> };

function toItem(m: Envelope): InboxItem {
  const from = m.envelope?.from?.[0];
  const to = (m.envelope?.to ?? []).map((a) => a.address ?? "").join(", ");
  return {
    uid: m.uid,
    from: from?.name || from?.address || "Unknown sender",
    fromEmail: (from?.address ?? "").toLowerCase(),
    to,
    subject: m.envelope?.subject || "(no subject)",
    date: m.envelope?.date ? new Date(m.envelope.date).toISOString() : null,
    unread: !(m.flags?.has("\\Seen") ?? false),
    alias: aliasFor(to),
  };
}

function imapFailed(e: unknown): InboxResult {
  console.error(`[zoho] inbox could not be read: ${(e as Error).message === "not_configured" ? "not configured" : "connection or sign-in failed"}`);
  return { ok: false, error: "The Zoho inbox couldn't be reached. Check the Zoho app password and that IMAP is turned on in Zoho Mail settings." };
}

/** The latest messages in the inbox, newest first. Reading doesn't mark them read. */
export async function listInbox(limit = 30): Promise<InboxResult> {
  if (!config()) return { ok: false, error: "Zoho Mail isn't connected yet." };
  try {
    const items = await withImap(async (c) => {
      const lock = await c.getMailboxLock("INBOX", { readOnly: true });
      try {
        const total = typeof c.mailbox === "object" && c.mailbox ? c.mailbox.exists : 0;
        if (!total) return [];
        const start = Math.max(1, total - limit + 1);
        const out: InboxItem[] = [];
        for await (const m of c.fetch(`${start}:*`, { uid: true, envelope: true, flags: true })) out.push(toItem(m as Envelope));
        return out.reverse();
      } finally {
        lock.release();
      }
    });
    return { ok: true, items };
  } catch (e) {
    return imapFailed(e);
  }
}

/** Searches the inbox by sender, subject or text (newest first, at most `limit`). */
export async function searchInbox(query: string, limit = 50): Promise<InboxResult> {
  if (!config()) return { ok: false, error: "Zoho Mail isn't connected yet." };
  const q = query.replace(/[\r\n"\\]/g, " ").trim().slice(0, 100);
  if (!q) return listInbox(limit);
  try {
    const items = await withImap(async (c) => {
      const lock = await c.getMailboxLock("INBOX", { readOnly: true });
      try {
        const found = await c.search({ or: [{ from: q }, { to: q }, { subject: q }, { body: q }] }, { uid: true });
        const uids = (Array.isArray(found) ? found : []).sort((a, b) => b - a).slice(0, limit);
        if (!uids.length) return [];
        const out: InboxItem[] = [];
        for await (const m of c.fetch(uids.join(","), { uid: true, envelope: true, flags: true }, { uid: true })) out.push(toItem(m as Envelope));
        return out.sort((a, b) => b.uid - a.uid);
      } finally {
        lock.release();
      }
    });
    return { ok: true, items };
  } catch (e) {
    return imapFailed(e);
  }
}

export type FullMessage = { uid: number; from: string; fromEmail: string; to: string; subject: string; date: string | null; text: string; messageId: string | null };

/** One message as plain text (HTML is never rendered). */
export async function readMessage(uid: number): Promise<FullMessage | null> {
  if (!config() || !Number.isInteger(uid) || uid <= 0) return null;
  try {
    return await withImap(async (c) => {
      const lock = await c.getMailboxLock("INBOX", { readOnly: true });
      try {
        const m = await c.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
        if (!m || !m.source) return null;
        const parsed = await simpleParser(m.source);
        const from = parsed.from?.value?.[0];
        const toField = Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [];
        return {
          uid,
          from: from?.name || from?.address || "Unknown sender",
          fromEmail: (from?.address ?? "").toLowerCase(),
          to: toField.flatMap((t) => t.value.map((v) => v.address ?? "")).join(", "),
          subject: parsed.subject || "(no subject)",
          date: parsed.date ? parsed.date.toISOString() : null,
          text: (parsed.text ?? "").slice(0, 100000),
          messageId: parsed.messageId ?? null,
        };
      } finally {
        lock.release();
      }
    });
  } catch {
    console.error("[zoho] message could not be read");
    return null;
  }
}

export type SmtpOutcome = { ok: true; id: string | null } | { ok: false; reason: string };

/**
 * Low-level SMTP send through the studio's Zoho account. Callers must check
 * every gate first (see lib/hub/zoho-send.ts, which does): this only sends.
 */
export async function smtpSend(input: { from: { name: string; address: string }; replyTo?: string | null; to: string; subject: string; text: string; inReplyTo?: string | null; headers?: Record<string, string> }): Promise<SmtpOutcome> {
  const cfg = config();
  if (!cfg) return { ok: false, reason: "Zoho Mail isn't connected yet." };
  try {
    const transport = nodemailer.createTransport({ host: cfg.smtpHost, port: cfg.smtpPort, secure: cfg.smtpSecure, ...(cfg.smtpSecure ? {} : { ignoreTLS: true }), auth: { user: cfg.user, pass: cfg.pass } });
    const info = await transport.sendMail({
      from: input.from,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.inReplyTo ? { inReplyTo: input.inReplyTo, references: input.inReplyTo } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
    });
    return { ok: true, id: info.messageId ?? null };
  } catch {
    console.error("[zoho] message could not be sent");
    return { ok: false, reason: "Zoho refused the message. Check that the address is set up to send in Zoho (Settings, Mail, Send mail as)." };
  }
}
