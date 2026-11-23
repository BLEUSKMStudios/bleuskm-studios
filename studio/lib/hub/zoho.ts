import "server-only";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { commsSendBlockReason } from "./env.ts";
import { aliasFor, ALIASES } from "./comms.ts";

// Zoho Mail: the studio inbox (studio@bleuskm.com, which also receives the
// crew@, casting@, films@, newsletter@ and clients@ aliases). Read over IMAP
// and reply over SMTP with an app password. Server-only: credentials never
// reach the browser.

function config() {
  const user = (process.env.ZOHO_MAIL_USER ?? "").trim();
  const pass = (process.env.ZOHO_MAIL_APP_PASSWORD ?? "").trim();
  if (!user || !pass) return null;
  return {
    user, pass,
    imapHost: (process.env.ZOHO_IMAP_HOST ?? "").trim() || "imap.zoho.com",
    smtpHost: (process.env.ZOHO_SMTP_HOST ?? "").trim() || "smtp.zoho.com",
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
    host: cfg.imapHost, port: 993, secure: true, auth: { user: cfg.user, pass: cfg.pass },
    logger: false, socketTimeout: 20000, greetingTimeout: 10000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
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
        for await (const m of c.fetch(`${start}:*`, { uid: true, envelope: true, flags: true })) {
          const from = m.envelope?.from?.[0];
          const to = (m.envelope?.to ?? []).map((a) => a.address ?? "").join(", ");
          out.push({
            uid: m.uid,
            from: from?.name || from?.address || "Unknown sender",
            fromEmail: (from?.address ?? "").toLowerCase(),
            to,
            subject: m.envelope?.subject || "(no subject)",
            date: m.envelope?.date ? new Date(m.envelope.date).toISOString() : null,
            unread: !(m.flags?.has("\\Seen") ?? false),
            alias: aliasFor(to),
          });
        }
        return out.reverse();
      } finally {
        lock.release();
      }
    });
    return { ok: true, items };
  } catch (e) {
    console.error(`[zoho] inbox could not be read: ${(e as Error).message === "not_configured" ? "not configured" : "connection or sign-in failed"}`);
    return { ok: false, error: "The Zoho inbox couldn't be reached. Check the Zoho app password and that IMAP is turned on in Zoho Mail settings." };
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

export type SendOutcome = { status: "sent"; id: string | null } | { status: "blocked"; reason: string } | { status: "failed"; reason: string };

/**
 * Sends a reply from one of the studio's own addresses. Refused unless the
 * owner has switched sending on (COMMS_SEND_ENABLED=on) and this isn't a
 * read-only Preview. Only the studio's aliases can be used as the sender.
 */
export async function sendReply(input: { from: string; to: string; subject: string; text: string; inReplyTo?: string | null }): Promise<SendOutcome> {
  const blocked = commsSendBlockReason();
  if (blocked) return { status: "blocked", reason: blocked };
  const cfg = config();
  if (!cfg) return { status: "blocked", reason: "Zoho Mail isn't connected yet." };
  const sender = ALIASES.find((a) => a.email === input.from.toLowerCase());
  if (!sender) return { status: "failed", reason: "Choose one of the studio's own addresses to send from." };
  try {
    const transport = nodemailer.createTransport({ host: cfg.smtpHost, port: 465, secure: true, auth: { user: cfg.user, pass: cfg.pass } });
    const info = await transport.sendMail({
      from: { name: sender.senderName, address: sender.email },
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.inReplyTo ? { inReplyTo: input.inReplyTo, references: input.inReplyTo } : {}),
    });
    return { status: "sent", id: info.messageId ?? null };
  } catch {
    console.error("[zoho] reply could not be sent");
    return { status: "failed", reason: "Zoho refused the message. Check that the address is set up as a sending alias in Zoho." };
  }
}
