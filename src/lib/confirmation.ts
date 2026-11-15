/**
 * The Purchase Confirmation: a signed record, for a consignor, that No. 67 bought their
 * consigned watch under clause 2.3 of the consignment agreement. It creates no new deal.
 * Wording approved 15 Nov 2026.
 */
import { z } from "zod";
import { brand, DOC_TYPES } from "./brand.ts";
import {
  documentPage,
  e,
  formatDateLong,
  formatMoney,
  itemTitle,
  moneyOrZero,
  orDash,
  requiredMoney,
  row,
  signaturesHtml,
  text,
  watchSummary,
  type BuildOptions,
  type DocSummary,
} from "./document.ts";

export const confirmationItemSchema = z.object({
  make: text(80).min(1, "Make is required"),
  model: text(120).min(1, "Model is required"),
  reference: text(80).default(""),
  serial: text(80).default(""),
  sellingPrice: requiredMoney,
  deductions: moneyOrZero,
});

export const confirmationSchema = z
  .object({
    consignor: z.object({
      name: text(160).min(1, "Name is required"),
      email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    }),
    consignmentRef: text(40).min(1, "Which consignment agreement?"),
    saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of sale"),
    items: z.array(confirmationItemSchema).min(1, "Add at least one watch").max(20),
    note: text(1500).default(""),
  })
  .superRefine((v, ctx) => {
    v.items.forEach((i, idx) => {
      if (i.sellingPrice - i.deductions <= 0) {
        ctx.addIssue({ code: "custom", path: ["items", idx, "deductions"], message: "Deductions must be less than the selling price" });
      }
    });
  });

export type ConfirmationInput = z.input<typeof confirmationSchema>;
export type Confirmation = z.output<typeof confirmationSchema>;

export const consignorPrice = (i: { sellingPrice: number; deductions: number }) => Math.round((i.sellingPrice - i.deductions) * 100) / 100;

export function confirmationTotal(c: Pick<Confirmation, "items">): number {
  return c.items.reduce((s, i) => s + consignorPrice(i), 0);
}

function saleDateLong(iso: string): string {
  return formatDateLong(new Date(`${iso}T12:00:00Z`));
}

export function summariseConfirmation(c: Confirmation, ref: string): DocSummary {
  return {
    ref,
    docType: "confirmation",
    consignorName: c.consignor.name,
    firstName: c.consignor.name.split(/\s+/)[0] || c.consignor.name,
    watch: watchSummary(c.items),
    facts: [
      ["Consignor Price", formatMoney(confirmationTotal(c))],
      ["Date of sale", saleDateLong(c.saleDate)],
      ["Consignment agreement", c.consignmentRef],
    ],
  };
}

export function buildConfirmationHtml(c: Confirmation, opts: BuildOptions): string {
  const T = DOC_TYPES.confirmation;
  const L = brand.legal;

  const itemsHtml = c.items
    .map(
      (i, idx) => `
      <table class="kv item">
        <tr class="item-head"><th>Watch ${idx + 1}</th><td><strong>${e(itemTitle(i))}</strong></td></tr>
        ${row("Reference", orDash(i.reference))}
        ${row("Serial number", orDash(i.serial))}
        ${row("Selling Price", e(formatMoney(i.sellingPrice)))}
        ${row("Commission and expenses", e(formatMoney(i.deductions)))}
        ${row("Consignor Price", `<strong>${e(formatMoney(consignorPrice(i)))}</strong>`)}
      </table>`,
    )
    .join("");
  const totalHtml = c.items.length > 1 ? `<table class="kv total">${row("Total Consignor Price", e(formatMoney(confirmationTotal(c))))}</table>` : "";

  const body = `
  <h1>${e(T.title)}</h1>
  <p class="intro">From <strong>${e(L.entity)}</strong>, trading as ${e(L.tradingAs)} (company number ${e(L.companyNumber)}, registered office ${e(L.registeredOffice)}) (&ldquo;No. 67&rdquo;), to the Consignor named below. This confirmation records a purchase made under consignment agreement ${e(c.consignmentRef)}. Capitalised words have the meanings given in that agreement.</p>

  <h2>The Consignor</h2>
  <table class="kv">${row("Name", e(c.consignor.name))}${row("Email", e(c.consignor.email))}${row("Consignment agreement", e(c.consignmentRef))}</table>

  <h2>The watches</h2>
  ${itemsHtml}
  ${totalHtml}

  <div class="keep-together">
  <h2>Confirmation</h2>
  <ol class="confirm">
    <li>Under clause 2.3 of the consignment agreement referenced above, No. 67 bought the ${c.items.length > 1 ? "watches" : "watch"} from the Consignor on ${e(saleDateLong(c.saleDate))} for the Consignor Price shown.</li>
    <li>No. 67 will pay the Consignor Price as set out in clause 6 of that agreement, to the account the Consignor gives No. 67 separately in writing.</li>
    <li>The Consignor confirms that the promises they gave in clause 9 of that agreement remain true, and that the ${c.items.length > 1 ? "watches were" : "watch was"} lawfully imported into the United Kingdom with all customs duty and import VAT paid and no customs liability outstanding.</li>
    <li>This confirmation forms part of the consignment agreement. If anything here conflicts with it, the consignment agreement applies.</li>
  </ol>
  ${signaturesHtml({ ...opts, partyRole: T.partyRole, partyLabel: "Signed by the Consignor", partyPrinted: c.consignor.name, partyNoun: T.partyNoun })}
  </div>
`;
  return documentPage({
    title: T.title,
    ref: opts.ref,
    metaLines: [`Ref. ${opts.ref}`, `Consignment ${c.consignmentRef}`],
    presigned: Boolean(opts.presignedOn),
    body,
  });
}
