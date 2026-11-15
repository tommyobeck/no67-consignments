/**
 * Pieces shared by every document the app sends: formatting, the page style,
 * the header, the signature block and the summary shown in emails and on the signing page.
 *
 * No server-only code here, so the private forms can show a live preview.
 */
import { z } from "zod";
import { brand, DOC_TYPES, ROLES, type DocType } from "./brand.ts";
import { SIGNATURE_FONT_WOFF2_BASE64 } from "./signatureFont.ts";

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

export const text = (max = 300) => z.string().trim().max(max);

const toNumberOrUndefined = (v: unknown) => {
  if (v === undefined || v === null || String(v).trim() === "") return undefined;
  return typeof v === "number" ? v : Number(String(v).replace(/[£,%\s]/g, ""));
};

export const optionalMoney = z.preprocess(
  toNumberOrUndefined,
  z.number({ error: "Enter an amount in pounds" }).positive("Enter an amount in pounds").optional(),
);

export const requiredMoney = z.preprocess(
  toNumberOrUndefined,
  z.number({ error: "Enter an amount in pounds" }).positive("Enter an amount in pounds"),
);

export const moneyOrZero = z.preprocess(
  (v) => toNumberOrUndefined(v) ?? 0,
  z.number({ error: "Enter an amount in pounds" }).min(0, "Enter an amount in pounds"),
);

/** The other party: a private individual or a company signing through a named person. */
export const partySchema = z.object({
  type: z.enum(["individual", "company"]),
  name: text(160).min(1, "Name is required"),
  signatoryName: text(160).default(""),
  signatoryRole: text(120).default(""),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: text(40).default(""),
  address: text(400).default(""),
});
export type Party = z.output<typeof partySchema>;

export function checkSignatory(party: Party, path: string, ctx: z.RefinementCtx) {
  if (party.type === "company" && !party.signatoryName) {
    ctx.addIssue({ code: "custom", path: [path, "signatoryName"], message: "Who is signing for the company?" });
  }
}

// ---------------------------------------------------------------------------
// Wording helpers
// ---------------------------------------------------------------------------

export function formatMoney(value: number | undefined): string {
  if (value === undefined) return "";
  const hasPence = Math.round(value * 100) % 100 !== 0;
  return "£" + value.toLocaleString("en-GB", { minimumFractionDigits: hasPence ? 2 : 0, maximumFractionDigits: 2 });
}

export function formatDateGB(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/London" });
}

export function formatDateLong(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
}

export function itemTitle(item: { make: string; model: string }): string {
  return `${item.make} ${item.model}`.trim();
}

export function watchSummary(items: { make: string; model: string; reference?: string }[]): string {
  if (items.length === 1) {
    const i = items[0];
    return [itemTitle(i), i.reference ? `ref. ${i.reference}` : ""].filter(Boolean).join(", ");
  }
  return `${items.length} watches`;
}

export function greetingName(p: Party): string {
  const n = p.type === "company" ? p.signatoryName || p.name : p.name;
  return n.split(/\s+/)[0] || n;
}

export function makeReference(docType: DocType = "consignment", date = new Date()): string {
  const yy = String(date.getUTCFullYear()).slice(2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) suffix += alphabet[b % alphabet.length];
  return `${DOC_TYPES[docType].refPrefix}-${yy}${mm}${dd}-${suffix}`;
}

export function submissionName(docType: DocType, ref: string, partyName: string): string {
  return `${DOC_TYPES[docType].namePrefix} ${ref} · ${partyName}`;
}

// ---------------------------------------------------------------------------
// Summary kept with the signing request (used by the signing page, lists and emails)
// ---------------------------------------------------------------------------

export type DocSummary = {
  ref: string;
  docType: DocType;
  /** The other party's name (kept under this key for agreements made before purchases existed). */
  consignorName: string;
  firstName: string;
  watch: string;
  /** Label and value pairs, shown in order. */
  facts: [string, string][];
  /** "yes" when the company signature was applied when the document was sent. */
  presigned?: string;
};

// ---------------------------------------------------------------------------
// HTML building blocks
// ---------------------------------------------------------------------------

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const e = escapeHtml;
export const orDash = (v: string | undefined) => (v && v.trim() ? e(v) : "&mdash;");
export const multiline = (v: string) => e(v).replace(/\r?\n/g, "<br>");

export function row(label: string, valueHtml: string): string {
  return `<tr><th>${e(label)}</th><td>${valueHtml}</td></tr>`;
}

export type CompanySigner = { name: string; title: string };

export type BuildOptions = {
  ref: string;
  companySigner: CompanySigner;
  /** Preview mode replaces signature fields with placeholders, so the browser can show it. */
  preview?: boolean;
  /** When set, the company signature is typed onto the document with this date, instead of a signing box. */
  presignedOn?: Date;
};

export function partyRows(p: Party): string {
  return [
    row("Name", e(p.name)),
    p.type === "company" ? row("Signatory and position", e([p.signatoryName, p.signatoryRole].filter(Boolean).join(", "))) : "",
    row("Address", orDash(p.address)),
    row("Email", e(p.email)),
    row("Telephone", orDash(p.phone)),
  ].join("");
}

export function companyIntro(partyNoun: string, extra = ""): string {
  const L = brand.legal;
  return `Between <strong>${e(L.entity)}</strong>, trading as ${e(L.tradingAs)} (company number ${e(L.companyNumber)}, registered office ${e(L.registeredOffice)}) (&ldquo;No. 67&rdquo;), and the ${e(partyNoun)} named below.${extra ? " " + extra : ""}`;
}

export function signaturesHtml(opts: BuildOptions & { partyRole: string; partyLabel: string; partyPrinted: string; partyNoun: string }): string {
  const { preview, presignedOn, companySigner, partyRole, partyLabel, partyPrinted, partyNoun } = opts;
  const L = brand.legal;
  const sigField = (role: string, label: string) =>
    preview
      ? `<div class="field-placeholder sig">${e(label)} signs here</div>`
      : `<signature-field name="${e(label)} signature" role="${e(role)}" format="drawn_or_typed" style="width: 240px; height: 64px; display: inline-block;"></signature-field>`;
  const dateField = (role: string, label: string) =>
    preview
      ? `<div class="field-placeholder date">Date</div>`
      : `<date-field name="${e(label)} date" role="${e(role)}" format="DD/MM/YYYY" style="width: 120px; height: 18px; display: inline-block;"></date-field>`;
  return `
  <div class="signatures">
    <div class="sig-block">
      <div class="sig-label">${e(partyLabel)}</div>
      ${sigField(partyRole, partyNoun)}
      <div class="sig-line">${e(partyPrinted)}</div>
      <div class="sig-date">Date: ${dateField(partyRole, partyNoun)}</div>
    </div>
    <div class="sig-block">
      <div class="sig-label">Signed for ${e(L.entity)}</div>
      ${presignedOn ? `<div class="typed-sig">${e(companySigner.name)}</div>` : sigField(ROLES.company, "Company")}
      <div class="sig-line">${e(companySigner.name)}, ${e(companySigner.title)}</div>
      <div class="sig-date">Date: ${presignedOn ? e(formatDateGB(presignedOn)) : dateField(ROLES.company, "Company")}</div>
    </div>
  </div>`;
}

export function partySignLabel(p: Party, partyNoun: string): { label: string; printed: string } {
  return p.type === "company"
    ? { label: `Signed for ${p.name}`, printed: [p.signatoryName, p.signatoryRole].filter(Boolean).join(", ") }
    : { label: `Signed by the ${partyNoun}`, printed: p.name };
}

/** Wraps a document body in the shared page: style, header with reference, and footer. */
export function documentPage(opts: { title: string; ref: string; metaLines: string[]; presigned: boolean; body: string }): string {
  const L = brand.legal;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${e(opts.title)} ${e(opts.ref)}</title>
<style>
  ${opts.presigned ? `@font-face { font-family: "No67 Signature"; src: url(data:font/woff2;base64,${SIGNATURE_FONT_WOFF2_BASE64}) format("woff2"); }` : ""}
  @page { size: A4; margin: 18mm 18mm 20mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 10pt; line-height: 1.5; color: #1A1A18; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid #1A1A18; padding-bottom: 10px; margin-bottom: 18px; }
  .brand { font-size: 17pt; font-weight: 500; letter-spacing: 0.01em; }
  .brand em { font-weight: 300; font-size: 12pt; color: #5F5B53; }
  .meta { text-align: right; font-size: 8pt; color: #5F5B53; line-height: 1.5; }
  h1 { font-size: 18pt; font-weight: 400; margin: 0 0 6px; }
  .intro { font-size: 8.5pt; color: #3E3B35; margin: 0 0 18px; }
  h2 { font-size: 8pt; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; margin: 20px 0 6px; }
  h3 { font-size: 9pt; font-weight: 700; margin: 12px 0 3px; }
  h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
  p.clause, ul.points li { break-inside: avoid; page-break-inside: avoid; }
  p.clause { margin: 0 0 5px; }
  ul.points { margin: 0 0 6px; padding-left: 20px; list-style: none; }
  ul.points li { margin-bottom: 2px; }
  table.kv { width: 100%; border-collapse: collapse; border-top: 1px solid #E2DDD3; }
  table.kv th { width: 36%; text-align: left; font-weight: 400; color: #5F5B53; padding: 5px 12px 5px 0; vertical-align: top; }
  table.kv td { padding: 5px 0; vertical-align: top; }
  table.item { margin-bottom: 10px; page-break-inside: avoid; }
  table.total { border-top: 1px solid #1A1A18; }
  table.total th, table.total td { font-weight: 700; color: #1A1A18; }
  .item-head th, .item-head td { padding-top: 8px; }
  .note { font-size: 8pt; color: #5F5B53; margin: 6px 0 0; }
  ol.confirm { margin: 6px 0 0; padding-left: 18px; }
  ol.confirm li { margin-bottom: 3px; }
  .keep-together { page-break-inside: avoid; break-inside: avoid; }
  .signatures { display: flex; gap: 28px; margin-top: 26px; page-break-inside: avoid; break-inside: avoid; }
  .sig-block { flex: 1; }
  .sig-label { font-size: 8pt; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; margin-bottom: 6px; }
  .sig-line { border-top: 1px solid #1A1A18; margin-top: 4px; padding-top: 4px; }
  .typed-sig { height: 64px; display: flex; align-items: flex-end; padding-bottom: 6px; font-family: "No67 Signature", "Snell Roundhand", "Apple Chancery", "Brush Script MT", "Segoe Script", cursive; font-size: 38pt; line-height: 1; color: #1A1A18; }
  .sig-date { font-size: 8.5pt; color: #5F5B53; margin-top: 6px; }
  .field-placeholder { border: 1px dashed #B9B3A7; color: #8C8679; font-size: 8pt; display: flex; align-items: center; justify-content: center; }
  .field-placeholder.sig { width: 240px; height: 64px; }
  .field-placeholder.date { width: 120px; height: 18px; display: inline-flex; }
  .foot { margin-top: 18px; break-inside: avoid; border-top: 1px solid #E2DDD3; padding-top: 8px; font-size: 7pt; color: #5F5B53; }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">${e(brand.name)} <em>${e(brand.subline)}</em></div>
    <div class="meta">${opts.metaLines.map(e).join("<br>")}</div>
  </div>
${opts.body}
  <div class="foot">${e(L.tradingAs)} is a trading name of ${e(L.entity)}, registered in England and Wales, company number ${e(L.companyNumber)}. Registered office: ${e(L.registeredOffice)}.</div>
</body>
</html>`;
}
