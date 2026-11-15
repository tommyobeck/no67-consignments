import { test } from "node:test";
import assert from "node:assert/strict";
import { purchaseSchema, buildPurchaseHtml, summarisePurchase, purchaseTotal } from "../src/lib/purchase.ts";
import { confirmationSchema, buildConfirmationHtml, summariseConfirmation } from "../src/lib/confirmation.ts";
import { makeReference } from "../src/lib/document.ts";

const signer = { name: "Tommy Zhao", title: "Director" };
const purchase = {
  seller: { type: "individual", name: "Ana Silva", email: "ana@example.com" },
  items: [
    { make: "Patek Philippe", model: "Calatrava", reference: "3919", price: "18,500", accessories: "Box, papers" },
    { make: "Rolex", model: "Explorer", reference: "14270", price: "6500", note: "Serviced 2024" },
  ],
  delivery: "collect",
  acceptance: "inspect",
};

test("purchase parses, totals and summarises", () => {
  const p = purchaseSchema.parse(purchase);
  assert.equal(purchaseTotal(p), 25000);
  const s = summarisePurchase(p, "P-1");
  assert.equal(s.docType, "purchase");
  assert.equal(s.watch, "2 watches");
  assert.deepEqual(s.facts[0], ["Price", "£25,000"]);
});

test("purchase needs a price per watch", () => {
  const r = purchaseSchema.safeParse({ ...purchase, items: [{ make: "Rolex", model: "Explorer" }] });
  assert.equal(r.success, false);
  assert.ok(!r.success && r.error.issues.some((i) => i.path.join(".") === "items.0.price"));
});

test("purchase document: options, total, terms, seller role, presigned", () => {
  const p = purchaseSchema.parse(purchase);
  const html = buildPurchaseHtml(p, { ref: "P-TEST", companySigner: signer, presignedOn: new Date("2026-11-15T12:00:00Z") });
  assert.match(html, /<h1>Purchase Agreement<\/h1>/);
  assert.match(html, /No\. 67 will arrange collection by insured courier at its cost\./);
  assert.match(html, /up to 3 business days after receiving it/);
  assert.match(html, /Total<\/th><td>£25,000/);
  assert.match(html, /lawfully imported into the United Kingdom/);
  assert.match(html, /<signature-field[^>]*role="Seller"/);
  assert.ok(!/role="Company"/.test(html));
  assert.match(html, /class="typed-sig">Tommy Zhao</);
  assert.ok(!/destroy/i.test(html));
});

test("purchase escapes input", () => {
  const p = purchaseSchema.parse({ ...purchase, seller: { ...purchase.seller, name: "<b>x</b>" } });
  const html = buildPurchaseHtml(p, { ref: "P", companySigner: signer });
  assert.ok(!html.includes("<b>x</b>"));
});

const conf = {
  consignor: { name: "James Carter", email: "james@example.com" },
  consignmentRef: "C-261114-ABCD",
  saleDate: "2026-11-20",
  items: [{ make: "Rolex", model: "Datejust", reference: "16234", sellingPrice: "9,000", deductions: "900" }],
};

test("confirmation computes Consignor Price and refers to the consignment", () => {
  const c = confirmationSchema.parse(conf);
  const s = summariseConfirmation(c, "PC-1");
  assert.deepEqual(s.facts[0], ["Consignor Price", "£8,100"]);
  assert.deepEqual(s.facts[1], ["Date of sale", "20 November 2026"]);
  const html = buildConfirmationHtml(c, { ref: "PC-TEST", companySigner: signer });
  assert.match(html, /clause 2\.3 of the consignment agreement/);
  assert.match(html, /on 20 November 2026/);
  assert.match(html, /Consignor Price<\/th><td><strong>£8,100/);
  assert.match(html, /<signature-field[^>]*role="Consignor"/);
  assert.match(html, /Consignment C-261114-ABCD/);
});

test("confirmation rejects deductions above the price", () => {
  const r = confirmationSchema.safeParse({ ...conf, items: [{ ...conf.items[0], deductions: "9500" }] });
  assert.equal(r.success, false);
});

test("reference prefixes", () => {
  const d = new Date("2026-11-15T10:00:00Z");
  assert.match(makeReference("purchase", d), /^P-261115-[A-Z2-9]{4}$/);
  assert.match(makeReference("confirmation", d), /^PC-261115-[A-Z2-9]{4}$/);
});
