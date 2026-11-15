import "server-only";
import { env } from "./env.ts";
import { brand } from "./brand.ts";
import { DOC_TYPES } from "./brand.ts";
import { escapeHtml as e, type DocSummary } from "./document.ts";

type Attachment = { filename: string; content: string /* base64 */ };

export type SendResult = { sent: boolean; skipped?: string };

async function send(to: string | string[], subject: string, html: string, text: string, attachments?: Attachment[]): Promise<SendResult> {
  const key = env.resendKey();
  if (!key) {
    console.warn(`[email] RESEND_API_KEY not set, so this email was not sent: "${subject}" to ${String(to)}`);
    return { sent: false, skipped: "Email sending is not set up yet (RESEND_API_KEY)." };
  }
  const replyTo = env.emailReplyTo();
  const apiUrl = (process.env.RESEND_API_URL || "https://api.resend.com").replace(/\/+$/, "");
  const res = await fetch(`${apiUrl}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.emailFrom(),
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(attachments?.length ? { attachments } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Email could not be sent (${res.status}): ${body}`);
  }
  return { sent: true };
}

const C = brand.colors;

function layout(bodyHtml: string): string {
  const L = brand.legal;
  return `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;background:${C.stone};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.stone};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.ground};font-family:'Work Sans',Helvetica,Arial,sans-serif;color:${C.ink};">
<tr><td style="background:${C.sage};height:6px;line-height:6px;font-size:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:36px 36px 0;font-size:22px;font-weight:500;">${e(brand.name)} <span style="font-weight:300;font-style:italic;font-size:16px;color:${C.muted};">${e(brand.subline)}</span></td></tr>
<tr><td style="padding:30px 36px 36px;font-size:15px;line-height:1.65;">${bodyHtml}</td></tr>
<tr><td align="center" style="border-top:1px solid ${C.line};padding:16px 36px 20px;font-size:11px;line-height:1.6;color:${C.muted};">${e(L.tradingAs)}, a trading name of ${e(L.entity)} · ${e(L.registeredOffice)}</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="background:${C.ink};">
<a href="${e(href)}" style="display:inline-block;padding:14px 28px;color:${C.ground};text-decoration:none;font-size:14px;font-weight:500;letter-spacing:0.04em;">${e(label)}</a></td></tr></table>`;
}

function summaryTable(s: Partial<DocSummary>): string {
  const rows: [string, string | undefined][] = [["Watch", s.watch], ...(s.facts ?? [])];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid ${C.line};font-size:14px;margin:18px 0 4px;">
${rows
  .filter(([, v]) => v)
  .map(([k, v]) => `<tr><td style="padding:8px 16px;color:${C.muted};width:150px;vertical-align:top;">${e(k)}</td><td style="padding:8px 16px 8px 0;">${e(v)}</td></tr>`)
  .join("")}
</table>`;
}

function summaryText(s: Partial<DocSummary>): string {
  return (s.facts ?? []).map(([k, v]) => `${k}: ${v}`).join("\n");
}

const firstNameOfSigner = () => env.companySigner().name.split(/\s+/)[0];

const para = (t: string) => `<p style="margin:0 0 14px;">${t}</p>`;

const typeOf = (s: Partial<DocSummary>) => DOC_TYPES[s.docType ?? "consignment"];
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function inviteIntro(s: DocSummary): string {
  switch (s.docType) {
    case "purchase":
      return `Thank you for selling your ${s.watch} to us. Your purchase agreement is ready to review and sign.`;
    case "confirmation":
      return `Your ${s.watch} has sold. Please review and sign the purchase confirmation for your records.`;
    default:
      return `Thank you for trusting us with your ${s.watch}. Your consignment agreement is ready to review and sign.`;
  }
}

export async function sendSigningInvite(args: { to: string; summary: DocSummary; signUrl: string; note?: string; signerName: string }): Promise<SendResult> {
  const s = args.summary;
  const T = typeOf(s);
  const noteHtml = args.note ? para(e(args.note).replace(/\r?\n/g, "<br>")) : "";
  const html = layout(
    para(`Dear ${e(s.firstName)},`) +
      para(e(inviteIntro(s))) +
      noteHtml +
      summaryTable(s) +
      button(args.signUrl, "Review and sign") +
      para("If anything needs changing, just reply to this email.") +
      para(`Best wishes,<br>${e(args.signerName.split(" ")[0])}`),
  );
  const text = `Dear ${s.firstName},

${inviteIntro(s)}
${args.signUrl}
${args.note ? `\n${args.note}\n` : ""}
${summaryText(s)}

If anything needs changing, just reply to this email.

Best wishes,
${args.signerName.split(" ")[0]}`;
  return send(args.to, `Your ${T.label} for ${s.watch}`, html, text);
}

/** Older name, kept so nothing else breaks. */
export const sendConsignorInvite = sendSigningInvite;

export async function sendCountersignRequest(args: { to: string; summary: Partial<DocSummary>; signUrl: string; adminUrl: string }): Promise<SendResult> {
  const s = args.summary;
  const T = typeOf(s);
  const who = s.consignorName ?? `The ${T.partyNoun.toLowerCase()}`;
  const html = layout(
    para(`<strong>${e(who)}</strong> has signed ${e(T.label)} ${e(s.ref ?? "")}.`) +
      summaryTable(s) +
      button(args.signUrl, "Countersign now") +
      para(`<a href="${e(args.adminUrl)}" style="color:${C.ink};">Open it</a>`),
  );
  const text = `${who} has signed ${T.label} ${s.ref ?? ""}.

Countersign: ${args.signUrl}
Details: ${args.adminUrl}`;
  return send(args.to, `Ready to countersign: ${s.ref ?? T.label} · ${s.consignorName ?? ""}`.trim(), html, text);
}

export async function sendCompletedCopy(args: {
  to: string;
  summary: Partial<DocSummary>;
  pdf?: { filename: string; base64: string };
  downloadUrl?: string;
  forCompany?: boolean;
}): Promise<SendResult> {
  const s = args.summary;
  const T = typeOf(s);
  const intro = args.forCompany
    ? para(`${e(capital(T.label))} ${e(s.ref ?? "")} with <strong>${e(s.consignorName ?? "")}</strong> is complete. The signed copy and audit certificate are attached.`)
    : para(`Dear ${e(s.firstName ?? "")},`) + para(`Your ${e(T.label)} is now signed. The completed copy is attached for your records.`);
  const linkHtml = !args.pdf && args.downloadUrl ? button(args.downloadUrl, "Download the agreement") : "";
  const html = layout(intro + summaryTable(s) + linkHtml + (args.forCompany ? "" : para(`With thanks,<br>${e(firstNameOfSigner())}`)));
  const text = args.forCompany
    ? `${capital(T.label)} ${s.ref ?? ""} with ${s.consignorName ?? ""} is complete.${args.downloadUrl ? `\n${args.downloadUrl}` : ""}`
    : `Dear ${s.firstName ?? ""},

Your ${T.label} is now signed. The completed copy is attached.${!args.pdf && args.downloadUrl ? `\n${args.downloadUrl}` : ""}

With thanks,
${firstNameOfSigner()}`;
  const subject = args.forCompany ? `Signed: ${s.ref ?? T.label} · ${s.consignorName ?? ""}` : `Your signed ${T.label}`;
  return send(args.to, subject, html, text, args.pdf ? [{ filename: args.pdf.filename, content: args.pdf.base64 }] : undefined);
}
