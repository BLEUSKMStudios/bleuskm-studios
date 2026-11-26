// The studio's email addresses and what each one is for. Pure code.

export type Alias = { email: string; senderName: string; purpose: string; area: string; via: string };

export const ALIASES: readonly Alias[] = [
  { email: "studio@bleuskm.com", senderName: "Zaria · BLEUSKM Studios", purpose: "The main studio mailbox. Every alias below delivers here.", area: "Communications", via: "Zoho Mail" },
  { email: "casting@bleuskm.com", senderName: "BLEUSKM Studios Casting", purpose: "Casting calls, applicant emails and callbacks.", area: "Casting", via: "Brevo (sending), Zoho (replies)" },
  { email: "crew@bleuskm.com", senderName: "BLEUSKM Studios Crew", purpose: "Crew calls, crew applicants and call sheets.", area: "Crew", via: "Brevo (sending), Zoho (replies)" },
  { email: "films@bleuskm.com", senderName: "BLEUSKM Studios Films", purpose: "Film notification announcements.", area: "Communications", via: "Brevo" },
  { email: "newsletter@bleuskm.com", senderName: "BLEUSKM Studios", purpose: "Newsletter campaigns.", area: "Communications", via: "Brevo" },
  { email: "clients@bleuskm.com", senderName: "BLEUSKM Studios", purpose: "Project inquiries and client work.", area: "Communications", via: "Zoho Mail" },
];

/** Which alias a message was sent to (from its To line), if any. */
export function aliasFor(to: string): string | null {
  const lower = to.toLowerCase();
  const hit = ALIASES.slice(1).find((a) => lower.includes(a.email));
  return hit ? hit.email : lower.includes(ALIASES[0].email) ? ALIASES[0].email : null;
}

/** "Re: " once, never "Re: Re: ". */
export function replySubject(subject: string): string {
  const s = subject.trim() || "(no subject)";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/** Quotes the original under a reply. */
export function quoteOriginal(text: string, from: string, date: string | null): string {
  const head = `On ${date ? new Date(date).toUTCString() : "an earlier date"}, ${from} wrote:`;
  const body = text.split(/\r?\n/).slice(0, 200).map((l) => `> ${l}`).join("\n");
  return `\n\n${head}\n${body}`;
}
