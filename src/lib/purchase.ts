/**
 * The Purchase Agreement: buying watches outright from a seller.
 * Self-contained: all terms are in the document. Wording approved 15 Nov 2026.
 */
import { z } from "zod";
import { DOC_TYPES } from "./brand.ts";
import {
  checkSignatory,
  companyIntro,
  documentPage,
  e,
  formatMoney,
  greetingName,
  itemTitle,
  multiline,
  orDash,
  partyRows,
  partySchema,
  partySignLabel,
  requiredMoney,
  row,
  signaturesHtml,
  text,
  watchSummary,
  type BuildOptions,
  type DocSummary,
} from "./document.ts";

export const purchaseItemSchema = z.object({
  make: text(80).min(1, "Make is required"),
  model: text(120).min(1, "Model is required"),
  reference: text(80).default(""),
  serial: text(80).default(""),
  year: text(20).default(""),
  accessories: text(200).default(""),
  note: text(1000).default(""),
  price: requiredMoney,
});

export const purchaseSchema = z
  .object({
    seller: partySchema,
    items: z.array(purchaseItemSchema).min(1, "Add at least one watch").max(20),
    delivery: z.enum(["seller", "collect"]),
    acceptance: z.enum(["inspect", "accepted"]),
    specialTerms: text(3000).default(""),
    note: text(1500).default(""),
  })
  .superRefine((v, ctx) => checkSignatory(v.seller, "seller", ctx));

export type PurchaseInput = z.input<typeof purchaseSchema>;
export type Purchase = z.output<typeof purchaseSchema>;

export const DELIVERY_TEXT = {
  seller: "The Seller will bring the watch to 67 Farringdon Road.",
  collect: "No. 67 will arrange collection by insured courier at its cost.",
} as const;

export const ACCEPTANCE_TEXT = {
  inspect: "No. 67 may inspect the watch for up to 3 business days after receiving it.",
  accepted: "No. 67 has inspected the watch and accepts it on signing.",
} as const;

export function purchaseTotal(p: Pick<Purchase, "items">): number {
  return p.items.reduce((s, i) => s + i.price, 0);
}

export function summarisePurchase(p: Purchase, ref: string): DocSummary {
  return {
    ref,
    docType: "purchase",
    consignorName: p.seller.name,
    firstName: greetingName(p.seller),
    watch: watchSummary(p.items),
    facts: [
      ["Price", formatMoney(purchaseTotal(p))],
      ["Delivery", p.delivery === "seller" ? "Drop off to 67 Farringdon Road" : "We collect by insured courier"],
      ["Payment", p.acceptance === "inspect" ? "Within 3 business days of acceptance" : "Within 3 business days of signing"],
    ],
  };
}

const P = (n: string, body: string) => `<p class="clause">${n} ${body}</p>`;
const points = (items: string[]) => `<ul class="points">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

export function buildPurchaseHtml(p: Purchase, opts: BuildOptions): string {
  const T = DOC_TYPES.purchase;
  const s = p.seller;
  const sign = partySignLabel(s, T.partyNoun);

  const itemsHtml = p.items
    .map(
      (i, idx) => `
      <table class="kv item">
        <tr class="item-head"><th>Watch ${idx + 1}</th><td><strong>${e(itemTitle(i))}</strong></td></tr>
        ${row("Reference", orDash(i.reference))}
        ${row("Serial number", orDash(i.serial))}
        ${row("Year", orDash(i.year))}
        ${row("Accessories", orDash(i.accessories))}
        ${i.note ? row("Note", multiline(i.note)) : ""}
        ${row("Price", e(formatMoney(i.price)))}
      </table>`,
    )
    .join("");
  const totalHtml = p.items.length > 1 ? `<table class="kv total">${row("Total", e(formatMoney(purchaseTotal(p))))}</table>` : "";

  const optionRows = [
    row("Delivery", e(DELIVERY_TEXT[p.delivery])),
    row("Acceptance", e(ACCEPTANCE_TEXT[p.acceptance])),
    row("Special terms", p.specialTerms ? multiline(p.specialTerms) : "None."),
  ].join("");

  const terms = `
  <h3>1. The agreement</h3>
  ${P("1.1", "The Seller agrees to sell, and No. 67 agrees to buy, the watches described above (the &ldquo;Watches&rdquo;) for the price stated (the &ldquo;Price&rdquo;), on these terms.")}
  ${P("1.2", "Where several watches are listed, each is a separate sale, and the terms apply to each one individually.")}

  <h3>2. Delivery</h3>
  ${P("2.1", "Where the Seller is bringing the Watches, they will deliver them to 67 Farringdon Road, London EC1M 3JB at a time agreed with No. 67.")}
  ${P("2.2", "Where No. 67 is arranging collection, it will book an insured courier at its own cost, to collect from the Seller&rsquo;s address at a time agreed with the Seller on a business day.")}
  ${P("2.3", "The Watches remain at the Seller&rsquo;s risk until No. 67 or its courier takes possession of them. From then, they are at No. 67&rsquo;s risk.")}

  <h3>3. Inspection and Acceptance</h3>
  ${P("3.1", "Where the agreement allows inspection, No. 67 may examine the Watches for up to 3 business days after receiving them, including checking authenticity, condition, working order and originality, and searching The Watch Register.")}
  ${P("3.2", "&ldquo;Acceptance&rdquo; means No. 67 confirming to the Seller in writing (email or message is enough) that it accepts the Watches. If No. 67 has not confirmed or cancelled within the inspection period, it is treated as having accepted.")}
  ${P("3.3", "Where the agreement says the Watches are accepted on signing, Acceptance takes place when both parties have signed, and clause 4 does not apply.")}

  <h3>4. If a watch is not as described</h3>
  ${P("4.1", "During the inspection period, No. 67 may cancel the purchase of a watch, or offer a revised price, if it reasonably finds that the watch:")}
  ${points([
    "(a) does not match its description in this agreement or in the Seller&rsquo;s messages to No. 67;",
    "(b) is not in good working order, or needs a full service or significant repair;",
    "(c) has damage or wear not disclosed to No. 67 before signing;",
    "(d) has parts that are not original or not authentic, including the case, caseback, dial, hands, crown, bezel, bracelet or strap; or",
    "(e) is missing, or has damaged, box, papers or accessories listed above.",
  ])}
  ${P("4.2", "If No. 67 offers a revised price and the Seller accepts it in writing, the revised price becomes the Price. If the Seller declines, or does not reply within 3 business days, the purchase of that watch is cancelled.")}
  ${P("4.3", "If a purchase is cancelled under this clause, No. 67 will return the watch to the Seller at No. 67&rsquo;s cost, by collection from 67 Farringdon Road or by insured courier.")}

  <h3>5. Payment and ownership</h3>
  ${P("5.1", "No. 67 will pay the Price by bank transfer within 3 business days of Acceptance, to the account the Seller gives No. 67 separately in writing. No. 67 is not responsible for loss caused by incorrect bank details given by the Seller.")}
  ${P("5.2", "Ownership of each watch passes to No. 67 when No. 67 pays its Price.")}
  ${P("5.3", "No. 67 may need to verify the Seller&rsquo;s identity, and the source of the Watches, before paying.")}

  <h3>6. The Seller&rsquo;s promises</h3>
  ${P("6.1", "The Seller confirms to No. 67, on signing and again on payment, that:")}
  ${points([
    "(a) they own each watch outright and have the right to sell it;",
    "(b) each watch is free of any finance, loan, lien, charge or claim by anyone else;",
    "(c) each watch, with its accessories and papers, is authentic;",
    "(d) they have told No. 67 about every defect, repair, replacement part or other issue they know of;",
    "(e) each watch was lawfully imported into the United Kingdom, all customs duty and import VAT due on it has been paid, and no customs liability, investigation or seizure is outstanding;",
    "(f) each watch was obtained lawfully and is not stolen, nor connected with money laundering or any other unlawful activity; and",
    "(g) if an individual, they are at least 18 years old; if signing for a company, they are authorised to do so.",
  ])}

  <h3>7. Indemnity</h3>
  ${P("7.1", "If any of the promises in clause 6 is untrue, the Seller will repay the Price to No. 67 on request and will cover No. 67&rsquo;s resulting losses and reasonable costs, including any customs duty, import VAT, penalties and claims by a later buyer or the true owner.")}

  <h3>8. Counterfeit or stolen watches</h3>
  ${P("8.1", "If No. 67 reasonably believes a watch is counterfeit, stolen, or otherwise connected with unlawful activity, it may keep the watch and pass it, with the Seller&rsquo;s details, to the police or another relevant authority. No. 67 has no obligation to pay for, or return, such a watch while the matter is investigated.")}

  <h3>9. General</h3>
  ${P("9.1", "No. 67&rsquo;s liability to the Seller is limited to the Price of the relevant watch, except where the law does not allow liability to be limited.")}
  ${P("9.2", "This agreement is the entire agreement between the parties about the Watches. Any change must be agreed in writing by both parties.")}
  ${P("9.3", "Personal information is handled as set out in No. 67&rsquo;s Privacy Notice, available on its website.")}
  ${P("9.4", "This agreement is governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.")}`;

  const body = `
  <h1>${e(T.title)}</h1>
  <p class="intro">${companyIntro(T.partyNoun)}</p>

  <h2>The Seller</h2>
  <table class="kv">${partyRows(s)}</table>

  <h2>The watches and price</h2>
  ${itemsHtml}
  ${totalHtml}

  <h2>Options for this deal</h2>
  <table class="kv">${optionRows}</table>

  <h2>Terms</h2>
  ${terms}

  <div class="keep-together">
  ${signaturesHtml({ ...opts, partyRole: T.partyRole, partyLabel: sign.label, partyPrinted: sign.printed, partyNoun: T.partyNoun })}
  </div>
`;
  return documentPage({ title: T.title, ref: opts.ref, metaLines: [`Ref. ${opts.ref}`], presigned: Boolean(opts.presignedOn), body });
}
