import { test } from "node:test";
import assert from "node:assert/strict";
import { agreementSchema, buildAgreementHtml, commissionWording, makeReference, summarise, escapeHtml } from "../src/lib/agreement.ts";

const base = {
  consignor: { type: "individual", name: "James Carter", email: "James@Example.com ", phone: "", address: "1 High St" },
  items: [{ make: "Rolex", model: "Datejust 36", reference: "16234", serial: "", year: "c1991", insuredValue: "8,500" }],
  terms: { basis: "percent", percent: "10", periodDays: "60" },
};

test("valid input parses and normalises", () => {
  const r = agreementSchema.safeParse(base);
  assert.ok(r.success, JSON.stringify(!r.success && r.error.issues));
  assert.equal(r.data.consignor.email, "james@example.com");
  assert.equal(r.data.items[0].insuredValue, 8500);
  assert.equal(r.data.terms.periodDays, 60);
});

test("period under 30 days is rejected", () => {
  const r = agreementSchema.safeParse({ ...base, terms: { ...base.terms, periodDays: "14" } });
  assert.equal(r.success, false);
});

test("minimum return needs both percent and amount", () => {
  const r = agreementSchema.safeParse({ ...base, terms: { basis: "min", percent: "10", periodDays: "60" } });
  assert.equal(r.success, false);
  assert.ok(!r.success && r.error.issues.some((i) => i.path.join(".") === "terms.amount"));
});

test("company consignor needs a signatory", () => {
  const r = agreementSchema.safeParse({ ...base, consignor: { ...base.consignor, type: "company" } });
  assert.equal(r.success, false);
});

test("commission wording for each basis", () => {
  const t = { periodDays: 60, bespoke: "", specialTerms: "", listingPrice: undefined, preApprovedPrice: undefined };
  assert.equal(commissionWording({ ...t, basis: "percent", percent: 10, amount: undefined }), "10% of the Selling Price.");
  assert.match(commissionWording({ ...t, basis: "net", percent: undefined, amount: 9000 }), /net price of £9,000 payable/);
  assert.match(commissionWording({ ...t, basis: "min", percent: 12.5, amount: 7500.5 }), /^12\.5% .* not less than £7,500\.50 /);
  assert.equal(commissionWording({ ...t, basis: "bespoke", percent: undefined, amount: undefined, bespoke: "Flat £500." }), "Flat £500.");
});

test("HTML has both signature roles and escapes input", () => {
  const evil = { ...base, consignor: { ...base.consignor, name: '<script>alert("x")</script>' } };
  const a = agreementSchema.parse(evil);
  const html = buildAgreementHtml(a, { ref: "C-TEST", companySigner: { name: "Tommy Zhao", title: "Director" } });
  assert.ok(!html.includes("<script>alert"), "user input must be escaped");
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
  assert.match(html, /<signature-field[^>]*role="Consignor"/);
  assert.match(html, /<signature-field[^>]*role="Company"/);
  assert.match(html, /<date-field[^>]*role="Consignor"/);
  assert.match(html, /60 days from the Commencement Date/);
  assert.match(html, /£8,500/);
  assert.ok(!/right to cancel/i.test(html), "cancellation notice was removed on request");
});

test("preview mode has no DocuSeal field tags", () => {
  const a = agreementSchema.parse(base);
  const html = buildAgreementHtml(a, { ref: "PREVIEW", companySigner: { name: "Tommy Zhao", title: "Director" }, preview: true });
  assert.ok(!html.includes("<signature-field"));
});

test("summary and reference", () => {
  const a = agreementSchema.parse(base);
  const s = summarise(a, "C-1");
  assert.equal(s.firstName, "James");
  assert.equal(s.watch, "Rolex Datejust 36, ref. 16234");
  assert.equal(s.insured, "£8,500");
  assert.match(makeReference(new Date("2026-11-14T10:00:00Z")), /^C-261114-[A-Z2-9]{4}$/);
  assert.equal(escapeHtml(`a&b'`), "a&amp;b&#39;");
});
