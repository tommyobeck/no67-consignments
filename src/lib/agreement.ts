/**
 * The Consignment Form: what you fill in, how the commission is worded,
 * and the HTML that DocuSeal turns into the signed PDF.
 *
 * This file has no server-only code, so the private form can show a live preview.
 */
import { z } from "zod";
import { brand, DOC_TYPES } from "./brand.ts";
import {
  checkSignatory,
  companyIntro,
  documentPage,
  e,
  formatMoney,
  greetingName,
  itemTitle,
  multiline,
  optionalMoney,
  orDash,
  partyRows,
  partySchema,
  partySignLabel,
  row,
  signaturesHtml,
  text,
  watchSummary,
  type BuildOptions,
  type DocSummary,
} from "./document.ts";

export {
  escapeHtml,
  formatDateGB,
  formatMoney,
  itemTitle,
  makeReference,
  submissionName,
  watchSummary,
  type BuildOptions,
  type CompanySigner,
  type DocSummary,
} from "./document.ts";

// ---------------------------------------------------------------------------
// What you fill in
// ---------------------------------------------------------------------------

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
    consignor: partySchema,
    items: z.array(itemSchema).min(1, "Add at least one watch").max(20),
    terms: z.object({
      basis: z.enum(COMMISSION_BASES),
      // Free text, so extras like "10% + VAT" can be added.
      rate: text(120).default(""),
      amount: optionalMoney,
      bespoke: text(2000).default(""),
      periodDays: z.coerce.number().int().min(brand.defaults.minPeriodDays, `At least ${brand.defaults.minPeriodDays} days`).max(730),
      listingPrice: optionalMoney,
      minNetReturn: optionalMoney,
      specialTerms: text(3000).default(""),
    }),
    note: text(1500).default(""),
  })
  .superRefine((v, ctx) => {
    const t = v.terms;
    if ((t.basis === "percent" || t.basis === "min") && !/\d/.test(t.rate)) {
      ctx.addIssue({ code: "custom", path: ["terms", "rate"], message: "Enter the commission, for example 10% or 10% + VAT" });
    }
    if ((t.basis === "net" || t.basis === "min") && t.amount === undefined) {
      ctx.addIssue({ code: "custom", path: ["terms", "amount"], message: "Enter an amount in pounds" });
    }
    if (t.basis === "bespoke" && !t.bespoke) {
      ctx.addIssue({ code: "custom", path: ["terms", "bespoke"], message: "Write the commission wording" });
    }
    checkSignatory(v.consignor, "consignor", ctx);
  });

export type AgreementInput = z.input<typeof agreementSchema>;
export type Agreement = z.output<typeof agreementSchema>;
export type Item = z.output<typeof itemSchema>;

// ---------------------------------------------------------------------------
// Wording helpers
// ---------------------------------------------------------------------------

/** "10" becomes "10%"; anything with words or symbols (e.g. "10% + VAT") is kept as typed. */
function pct(rate: string | undefined): string {
  const r = (rate ?? "").trim();
  if (!r) return "[X]%";
  return /^\d+(\.\d+)?$/.test(r) ? `${r}%` : r;
}

/** "10%" reads "10% of the Selling Price"; "10% + VAT" reads "10% + VAT, calculated on the Selling Price". */
function rateOn(rate: string | undefined, price: string): string {
  const r = pct(rate);
  return /^\d+(\.\d+)?%$/.test(r) || r === "[X]%" ? `${r} of the ${price}` : `${r}, calculated on the ${price}`;
}

/** The sentence that appears against "Commission" on the form. */
export function commissionWording(t: Agreement["terms"]): string {
  switch (t.basis) {
    case "percent":
      return `${rateOn(t.rate, "Selling Price")}.`;
    case "net":
      return `The difference between the Selling Price and an agreed net price of ${formatMoney(t.amount)} payable to the Consignor.`;
    case "min":
      return `${rateOn(t.rate, "Selling Price")}, reduced where necessary so that the Consignor Price is not less than ${formatMoney(t.amount)} before any Servicing Expenses.`;
    case "bespoke":
      return t.bespoke;
  }
}

/** A short version for emails and the summary on the signing page. */
export function commissionShort(t: Agreement["terms"]): string {
  switch (t.basis) {
    case "percent":
      return rateOn(t.rate, "selling price");
    case "net":
      return `Net price to you of ${formatMoney(t.amount)}`;
    case "min":
      return `${rateOn(t.rate, "selling price")}, minimum return ${formatMoney(t.amount)}`;
    case "bespoke":
      return "As set out in the agreement";
  }
}

/** Kept for older imports: the consignment summary is a DocSummary. */
export type AgreementSummary = DocSummary;

export function summarise(a: Agreement, ref: string): DocSummary {
  const insuredTotal = a.items.reduce((s, i) => s + (i.insuredValue ?? 0), 0);
  return {
    ref,
    docType: "consignment",
    consignorName: a.consignor.name,
    firstName: greetingName(a.consignor),
    watch: watchSummary(a.items),
    facts: [
      ["Commission", commissionShort(a.terms)],
      ["Initial period", `${a.terms.periodDays} days from acceptance`],
      ["Insured value", insuredTotal > 0 ? formatMoney(insuredTotal) : "As notified after delivery"],
    ],
  };
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export function buildAgreementHtml(a: Agreement, opts: BuildOptions): string {
  const c = a.consignor;
  const t = a.terms;
  const T = DOC_TYPES.consignment;

  const itemsHtml = a.items
    .map(
      (i, idx) => `
      <table class="kv item">
        <tr class="item-head"><th>Watch ${idx + 1}</th><td><strong>${e(itemTitle(i))}</strong></td></tr>
        ${row("Reference", orDash(i.reference))}
        ${row("Serial number", orDash(i.serial))}
        ${row("Year", orDash(i.year))}
        ${row("Accessories", orDash([i.boxPapers, i.accessories].filter(Boolean).join(", ")))}
        ${row("Insured Value", i.insuredValue !== undefined ? e(formatMoney(i.insuredValue)) : "The Recommended Selling Price (clause 1.1)")}
        ${i.disclosures ? row("Note", multiline(i.disclosures)) : ""}
      </table>`,
    )
    .join("");

  const termsRows = [
    row("Commission", multiline(commissionWording(t))),
    row(
      "Initial listing price",
      t.listingPrice !== undefined ? e(formatMoney(t.listingPrice)) : "To be notified in writing after delivery (clause 5.3).",
    ),
    t.minNetReturn !== undefined ? row("Minimum net return", e(formatMoney(t.minNetReturn))) : "",
    row("Initial period", `${t.periodDays} days from the Commencement Date, renewing monthly thereafter.`),
    row("Special terms", t.specialTerms ? multiline(t.specialTerms) : "None."),
  ].join("");

  const sign = partySignLabel(c, T.partyNoun);

  const body = `
  <h1>${e(T.title)}</h1>
  <p class="intro">${companyIntro(T.partyNoun, `This form refers to and incorporates No. 67&rsquo;s ${e(brand.terms.title)} (version ${e(brand.terms.version)}), available at ${e(brand.terms.url)}.`)}</p>

  <h2>1. The Consignor</h2>
  <table class="kv">${partyRows(c)}</table>
  <p class="note">The Consignor must be the individual, company or other entity with good title to each Consignment Item and full authority to sell it.</p>

  <h2>2. Consignment Items</h2>
  ${itemsHtml}

  <h2>3. Commercial Terms</h2>
  <table class="kv">${termsRows}</table>

  <div class="keep-together">
  <h2>4. Consignor&rsquo;s confirmation</h2>
  <p style="margin: 0;">By signing this form, the Consignor:</p>
  <ol class="confirm" type="a">
    <li>accepts the ${e(brand.terms.title)} in their entirety and agrees that they and this form together constitute a binding Agreement with No. 67;</li>
    <li>represents that the information in this form is accurate, complete and not misleading; and</li>
    <li>gives the warranties in clause 9, including as to title, authenticity, disclosure and lawful source.</li>
  </ol>
  ${signaturesHtml({ ...opts, partyRole: T.partyRole, partyLabel: sign.label, partyPrinted: sign.printed, partyNoun: T.partyNoun })}
  </div>
`;
  return documentPage({
    title: T.title,
    ref: opts.ref,
    metaLines: [`Ref. ${opts.ref}`, `Terms version ${brand.terms.shortVersion}`],
    presigned: Boolean(opts.presignedOn),
    body,
  });
}
