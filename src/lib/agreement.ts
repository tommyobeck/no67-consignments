/**
 * The Consignment Form: what you fill in, how the commission is worded,
 * and the HTML that DocuSeal turns into the signed PDF.
 *
 * This file has no server-only code, so the private form can show a live preview.
 */
import { z } from "zod";
import { brand, ROLES, SUBMISSION_PREFIX } from "./brand.ts";

// ---------------------------------------------------------------------------
// What you fill in
// ---------------------------------------------------------------------------

const text = (max = 300) => z.string().trim().max(max);
const toNumberOrUndefined = (v: unknown) => {
  if (v === undefined || v === null || String(v).trim() === "") return undefined;
  return typeof v === "number" ? v : Number(String(v).replace(/[£,%\s]/g, ""));
};
const optionalMoney = z.preprocess(
  toNumberOrUndefined,
  z.number({ error: "Enter an amount in pounds" }).positive("Enter an amount in pounds").optional(),
);
const optionalPercent = z.preprocess(toNumberOrUndefined, z.number({ error: "Enter a percentage" }).optional());

export const itemSchema = z.object({
  make: text(80).min(1, "Make is required"),
  model: text(120).min(1, "Model is required"),
  reference: text(80).default(""),
  serial: text(80).default(""),
  year: text(20).default(""),
  boxPapers: text(200).default(""),
  accessories: text(200).default(""),
  disclosures: text(1000).default(""),
  insuredValue: optionalMoney,
});

export const COMMISSION_BASES = ["percent", "net", "min", "bespoke"] as const;
export type CommissionBasis = (typeof COMMISSION_BASES)[number];

export const agreementSchema = z
  .object({
    consignor: z.object({
      type: z.enum(["individual", "company"]),
      name: text(160).min(1, "Name is required"),
      signatoryName: text(160).default(""),
      signatoryRole: text(120).default(""),
      email: z.string().trim().toLowerCase().email("Enter a valid email address"),
      phone: text(40).default(""),
      address: text(400).default(""),
    }),
    items: z.array(itemSchema).min(1, "Add at least one watch").max(20),
    terms: z.object({
      basis: z.enum(COMMISSION_BASES),
      percent: optionalPercent,
      amount: optionalMoney,
      bespoke: text(2000).default(""),
      periodDays: z.coerce.number().int().min(brand.defaults.minPeriodDays, `At least ${brand.defaults.minPeriodDays} days`).max(730),
      listingPrice: optionalMoney,
      preApprovedPrice: optionalMoney,
      specialTerms: text(3000).default(""),
    }),
    note: text(1500).default(""),
  })
  .superRefine((v, ctx) => {
    const t = v.terms;
    if ((t.basis === "percent" || t.basis === "min") && !(t.percent !== undefined && t.percent > 0 && t.percent < 100)) {
      ctx.addIssue({ code: "custom", path: ["terms", "percent"], message: "Enter a percentage between 0 and 100" });
    }
    if ((t.basis === "net" || t.basis === "min") && t.amount === undefined) {
      ctx.addIssue({ code: "custom", path: ["terms", "amount"], message: "Enter an amount in pounds" });
    }
    if (t.basis === "bespoke" && !t.bespoke) {
      ctx.addIssue({ code: "custom", path: ["terms", "bespoke"], message: "Write the commission wording" });
    }
    if (v.consignor.type === "company" && !v.consignor.signatoryName) {
      ctx.addIssue({ code: "custom", path: ["consignor", "signatoryName"], message: "Who is signing for the company?" });
    }
  });

export type AgreementInput = z.input<typeof agreementSchema>;
export type Agreement = z.output<typeof agreementSchema>;
export type Item = z.output<typeof itemSchema>;

// ---------------------------------------------------------------------------
// Wording helpers
// ---------------------------------------------------------------------------

export function formatMoney(value: number | undefined): string {
  if (value === undefined) return "";
  const hasPence = Math.round(value * 100) % 100 !== 0;
  return "£" + value.toLocaleString("en-GB", { minimumFractionDigits: hasPence ? 2 : 0, maximumFractionDigits: 2 });
}

function pct(value: number | undefined): string {
  if (value === undefined) return "[X]%";
  return `${Number(value.toFixed(2))}%`;
}

/** The sentence that appears against "Commission" on the form. */
export function commissionWording(t: Agreement["terms"]): string {
  switch (t.basis) {
    case "percent":
      return `${pct(t.percent)} of the Selling Price.`;
    case "net":
      return `The difference between the Selling Price and an agreed net price of ${formatMoney(t.amount)} payable to the Consignor.`;
    case "min":
      return `${pct(t.percent)} of the Selling Price, reduced where necessary so that the Consignor Price is not less than ${formatMoney(t.amount)} before any Servicing Expenses.`;
    case "bespoke":
      return t.bespoke;
  }
}

/** A short version for emails and the summary on the signing page. */
export function commissionShort(t: Agreement["terms"]): string {
  switch (t.basis) {
    case "percent":
      return `${pct(t.percent)} of the selling price`;
    case "net":
      return `Net price to you of ${formatMoney(t.amount)}`;
    case "min":
      return `${pct(t.percent)} of the selling price, minimum return ${formatMoney(t.amount)}`;
    case "bespoke":
      return "As set out in the agreement";
  }
}

export function itemTitle(item: Pick<Item, "make" | "model">): string {
  return `${item.make} ${item.model}`.trim();
}

export function watchSummary(items: Item[]): string {
  if (items.length === 1) {
    const i = items[0];
    return [itemTitle(i), i.reference ? `ref. ${i.reference}` : ""].filter(Boolean).join(", ");
  }
  return `${items.length} watches`;
}

export function makeReference(date = new Date()): string {
  const yy = String(date.getUTCFullYear()).slice(2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) suffix += alphabet[b % alphabet.length];
  return `C-${yy}${mm}${dd}-${suffix}`;
}

export function submissionName(ref: string, consignorName: string): string {
  return `${SUBMISSION_PREFIX} ${ref} · ${consignorName}`;
}

/** Small summary stored with the signing request, used by the signing page and emails. */
export type AgreementSummary = {
  ref: string;
  consignorName: string;
  firstName: string;
  watch: string;
  commission: string;
  period: string;
  insured: string;
};

export function summarise(a: Agreement, ref: string): AgreementSummary {
  const insuredTotal = a.items.reduce((s, i) => s + (i.insuredValue ?? 0), 0);
  const greetingName = a.consignor.type === "company" ? a.consignor.signatoryName || a.consignor.name : a.consignor.name;
  return {
    ref,
    consignorName: a.consignor.name,
    firstName: greetingName.split(/\s+/)[0] || greetingName,
    watch: watchSummary(a.items),
    commission: commissionShort(a.terms),
    period: `${a.terms.periodDays} days from acceptance`,
    insured: insuredTotal > 0 ? formatMoney(insuredTotal) : "As notified after delivery",
  };
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = escapeHtml;
const orDash = (v: string | undefined) => (v && v.trim() ? e(v) : "&mdash;");
const multiline = (v: string) => e(v).replace(/\r?\n/g, "<br>");

function row(label: string, valueHtml: string): string {
  return `<tr><th>${e(label)}</th><td>${valueHtml}</td></tr>`;
}

export type CompanySigner = { name: string; title: string };

export type BuildOptions = {
  ref: string;
  companySigner: CompanySigner;
  /** Preview mode replaces signature fields with placeholders, so the browser can show it. */
  preview?: boolean;
};

export function buildAgreementHtml(a: Agreement, opts: BuildOptions): string {
  const { ref, companySigner, preview } = opts;
  const c = a.consignor;
  const t = a.terms;
  const L = brand.legal;

  const sigField = (role: string, label: string) =>
    preview
      ? `<div class="field-placeholder sig">${e(label)} signs here</div>`
      : `<signature-field name="${e(label)} signature" role="${e(role)}" format="drawn_or_typed" style="width: 240px; height: 64px; display: inline-block;"></signature-field>`;
  const dateField = (role: string, label: string) =>
    preview
      ? `<div class="field-placeholder date">Date</div>`
      : `<date-field name="${e(label)} date" role="${e(role)}" format="DD/MM/YYYY" style="width: 120px; height: 18px; display: inline-block;"></date-field>`;

  const consignorRows = [
    row("Name", e(c.name)),
    row("Consigning as", c.type === "company" ? "A company or other business" : "A private individual"),
    c.type === "company" ? row("Signatory and position", e([c.signatoryName, c.signatoryRole].filter(Boolean).join(", "))) : "",
    row("Address", orDash(c.address)),
    row("Email", e(c.email)),
    row("Telephone", orDash(c.phone)),
  ].join("");

  const itemsHtml = a.items
    .map(
      (i, idx) => `
      <table class="kv item">
        <tr class="item-head"><th>Item ${idx + 1}</th><td><strong>${e(itemTitle(i))}</strong></td></tr>
        ${row("Reference", orDash(i.reference))}
        ${row("Serial number", orDash(i.serial))}
        ${row("Year", orDash(i.year))}
        ${row("Box and papers", orDash(i.boxPapers))}
        ${row("Accessories", orDash(i.accessories))}
        ${row("Disclosed matters", i.disclosures ? multiline(i.disclosures) : "None known")}
        ${row("Insured Value", i.insuredValue !== undefined ? e(formatMoney(i.insuredValue)) : "The Recommended Selling Price (clause 1.1)")}
      </table>`,
    )
    .join("");

  const termsRows = [
    row("Commission", multiline(commissionWording(t))),
    row(
      "Initial listing price",
      t.listingPrice !== undefined ? `${e(formatMoney(t.listingPrice))}.` : "To be notified in writing after delivery (clause 5.3).",
    ),
    row(
      "Pre-approved price",
      t.preApprovedPrice !== undefined
        ? `The Company may accept any offer at or above ${e(formatMoney(t.preApprovedPrice))} without further reference to the Consignor (clause 5.4).`
        : "None. All offers will be referred to the Consignor (clause 5.4).",
    ),
    row("Initial period", `${t.periodDays} days from the Commencement Date, renewing monthly thereafter.`),
    row("Early return fee", `${e(formatMoney(brand.defaults.earlyReturnFee))} per Consignment Item, as set out in clause 3.3.`),
    row("Special terms", t.specialTerms ? multiline(t.specialTerms) : "None."),
  ].join("");

  const consignorSignLabel = c.type === "company" ? `Signed for ${c.name}` : "Signed by the Consignor";
  const consignorPrinted = c.type === "company" ? [c.signatoryName, c.signatoryRole].filter(Boolean).join(", ") : c.name;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Consignment Form ${e(ref)}</title>
<style>
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
  table.kv { width: 100%; border-collapse: collapse; border-top: 1px solid #E2DDD3; }
  table.kv th { width: 36%; text-align: left; font-weight: 400; color: #5F5B53; padding: 5px 12px 5px 0; vertical-align: top; }
  table.kv td { padding: 5px 0; vertical-align: top; }
  table.item { margin-bottom: 10px; page-break-inside: avoid; }
  .item-head th, .item-head td { padding-top: 8px; }
  .note { font-size: 8pt; color: #5F5B53; margin: 6px 0 0; }
  ol.confirm { margin: 6px 0 0; padding-left: 18px; }
  ol.confirm li { margin-bottom: 3px; }
  .signatures { display: flex; gap: 28px; margin-top: 26px; page-break-inside: avoid; }
  .sig-block { flex: 1; }
  .sig-label { font-size: 8pt; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; margin-bottom: 6px; }
  .sig-line { border-top: 1px solid #1A1A18; margin-top: 4px; padding-top: 4px; }
  .sig-date { font-size: 8.5pt; color: #5F5B53; margin-top: 6px; }
  .field-placeholder { border: 1px dashed #B9B3A7; color: #8C8679; font-size: 8pt; display: flex; align-items: center; justify-content: center; }
  .field-placeholder.sig { width: 240px; height: 64px; }
  .field-placeholder.date { width: 120px; height: 18px; display: inline-flex; }
  .foot { margin-top: 28px; border-top: 1px solid #E2DDD3; padding-top: 8px; font-size: 7pt; color: #5F5B53; }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">${e(brand.name)} <em>${e(brand.subline)}</em></div>
    <div class="meta">Ref. ${e(ref)}<br>Terms version ${e(brand.terms.shortVersion)}</div>
  </div>

  <h1>Consignment Form</h1>
  <p class="intro">Between <strong>${e(L.entity)}</strong>, trading as ${e(L.tradingAs)} (company number ${e(L.companyNumber)}, registered office ${e(L.registeredOffice)}) (the &ldquo;Company&rdquo;), and the Consignor named below. This form refers to and incorporates the Company&rsquo;s ${e(brand.terms.title)} (version ${e(brand.terms.version)}), available at ${e(brand.terms.url)}. Capitalised words have the meanings given there.</p>

  <h2>1. The Consignor</h2>
  <table class="kv">${consignorRows}</table>
  <p class="note">The Consignor must be the individual, company or other entity with good title to each Consignment Item and full authority to sell it.</p>

  <h2>2. Consignment Items</h2>
  ${itemsHtml}

  <h2>3. Commercial Terms</h2>
  <table class="kv">${termsRows}</table>

  <h2>4. Consignor&rsquo;s confirmation</h2>
  <p style="margin: 0;">By signing this form, the Consignor:</p>
  <ol class="confirm" type="a">
    <li>accepts the ${e(brand.terms.title)} in their entirety and agrees that they and this form together constitute a binding Agreement with the Company;</li>
    <li>represents that the information in this form is accurate, complete and not misleading;</li>
    <li>gives the warranties in clause 9, including as to title, authenticity, disclosure and lawful source; and</li>
    <li>acknowledges that the Company will verify the Consignor&rsquo;s identity and check each Consignment Item against The Watch Register before acceptance.</li>
  </ol>

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-label">${e(consignorSignLabel)}</div>
      ${sigField(ROLES.consignor, "Consignor")}
      <div class="sig-line">${e(consignorPrinted)}</div>
      <div class="sig-date">Date: ${dateField(ROLES.consignor, "Consignor")}</div>
    </div>
    <div class="sig-block">
      <div class="sig-label">Signed for ${e(L.entity)}</div>
      ${sigField(ROLES.company, "Company")}
      <div class="sig-line">${e(companySigner.name)}, ${e(companySigner.title)}</div>
      <div class="sig-date">Date: ${dateField(ROLES.company, "Company")}</div>
    </div>
  </div>

  <div class="foot">${e(L.tradingAs)} is a trading name of ${e(L.entity)}, registered in England and Wales, company number ${e(L.companyNumber)}. Registered office: ${e(L.registeredOffice)}.</div>
</body>
</html>`;
}
