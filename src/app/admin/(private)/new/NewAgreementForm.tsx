"use client";

import { cloneElement, useActionState, useMemo, useState } from "react";
import { brand } from "@/lib/brand.ts";
import {
  agreementSchema,
  buildAgreementHtml,
  commissionWording,
  type CommissionBasis,
  type CompanySigner,
} from "@/lib/agreement.ts";
import { createAgreement, type CreateState } from "../actions.ts";

type ItemDraft = {
  make: string;
  model: string;
  reference: string;
  serial: string;
  year: string;
  boxPapers: string;
  accessories: string;
  disclosures: string;
  insuredValue: string;
};

const emptyItem = (): ItemDraft => ({
  make: "",
  model: "",
  reference: "",
  serial: "",
  year: "",
  boxPapers: "",
  accessories: "",
  disclosures: "",
  insuredValue: "",
});

const BASES: { id: CommissionBasis; label: string }[] = [
  { id: "percent", label: "Percentage" },
  { id: "net", label: "Net price to consignor" },
  { id: "min", label: "Percentage with minimum return" },
  { id: "bespoke", label: "Bespoke" },
];

export function NewAgreementForm({ signer }: { signer: CompanySigner }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createAgreement, {});

  const [ctype, setCtype] = useState<"individual" | "company">("individual");
  const [consignor, setConsignor] = useState({ name: "", signatoryName: "", signatoryRole: "", email: "", phone: "", address: "" });
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [basis, setBasis] = useState<CommissionBasis>("percent");
  const [terms, setTerms] = useState({
    percent: String(brand.defaults.commissionPercent),
    amount: "",
    bespoke: "",
    periodDays: String(brand.defaults.periodDays),
    listingPrice: "",
    preApprovedPrice: "",
    specialTerms: "",
  });
  const [note, setNote] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const payload = useMemo(
    () => ({
      consignor: { type: ctype, ...consignor },
      items,
      terms: { basis, ...terms },
      note,
    }),
    [ctype, consignor, items, basis, terms, note],
  );

  const check = useMemo(() => agreementSchema.safeParse(payload), [payload]);

  // Show an error from the last submit only while that field is still wrong.
  const errors = state.errors ?? {};
  const stillWrong = useMemo(() => new Set(check.success ? [] : check.error.issues.map((i) => i.path.map(String).join("."))), [check]);
  const err = (k: string) => (stillWrong.has(k) ? errors[k] : undefined);

  const wording = useMemo(() => {
    const p = terms.percent.trim() === "" ? undefined : Number(terms.percent);
    const amt = terms.amount.trim() === "" ? undefined : Number(terms.amount.replace(/[£,\s]/g, ""));
    return commissionWording({
      basis,
      percent: Number.isFinite(p as number) ? p : undefined,
      amount: Number.isFinite(amt as number) ? amt : undefined,
      bespoke: terms.bespoke || "Your own wording, exactly as typed.",
      periodDays: 0,
      listingPrice: undefined,
      preApprovedPrice: undefined,
      specialTerms: "",
    });
  }, [basis, terms.percent, terms.amount, terms.bespoke]);

  const previewHtml = useMemo(() => {
    if (!showPreview || !check.success) return "";
    return buildAgreementHtml(check.data, { ref: "PREVIEW", companySigner: signer, preview: true });
  }, [showPreview, check, signer]);

  const setC = (k: keyof typeof consignor) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setConsignor({ ...consignor, [k]: e.target.value });
  const setT = (k: keyof typeof terms) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setTerms({ ...terms, [k]: e.target.value });
  const setI = (idx: number, k: keyof ItemDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, [k]: e.target.value } : it)));

  // Each field: a label tied to its input, and any error linked for screen readers.
  const F = ({ k, label, children, wide }: { k: string; label: string; children: React.ReactElement<Record<string, unknown>>; wide?: boolean }) => {
    const id = `f-${k.replace(/\./g, "-")}`;
    const errId = `${id}-err`;
    const control = cloneElement(children, { id, "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? errId : undefined });
    return (
      <div className={`field${err(k) ? " has-error" : ""}`} style={wide ? { gridColumn: "1 / -1" } : undefined}>
        <label htmlFor={id}>{label}</label>
        {control}
        {err(k) && (
          <span className="err" id={errId}>
            {err(k)}
          </span>
        )}
      </div>
    );
  };

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 36 }} noValidate>
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      {state.formError && <div className="notice error" role="alert">{state.formError}</div>}

      {/* 1. Consignor */}
      <section className="form-section">
        <h2 className="section-title">1. Consignor</h2>
        <div className="pills" role="group" aria-label="Consigning as">
          <button type="button" className="pill" aria-pressed={ctype === "individual"} onClick={() => setCtype("individual")}>
            Private individual
          </button>
          <button type="button" className="pill" aria-pressed={ctype === "company"} onClick={() => setCtype("company")}>
            Company or business
          </button>
        </div>
        <div className="grid-2">
          {F({ k: "consignor.name", label: ctype === "company" ? "Company name" : "Full name", children: <input value={consignor.name} onChange={setC("name")} autoComplete="off" /> })}
          {F({ k: "consignor.email", label: "Email", children: <input type="email" value={consignor.email} onChange={setC("email")} autoComplete="off" /> })}
          {ctype === "company" &&
            F({ k: "consignor.signatoryName", label: "Person signing", children: <input value={consignor.signatoryName} onChange={setC("signatoryName")} /> })}
          {ctype === "company" &&
            F({ k: "consignor.signatoryRole", label: "Their position", children: <input value={consignor.signatoryRole} onChange={setC("signatoryRole")} placeholder="e.g. Director" /> })}
          {F({ k: "consignor.phone", label: "Telephone", children: <input type="tel" value={consignor.phone} onChange={setC("phone")} /> })}
          {F({ k: "consignor.address", label: "Address", children: <input value={consignor.address} onChange={setC("address")} /> })}
        </div>
      </section>

      {/* 2. Watches */}
      <section className="form-section">
        <h2 className="section-title">2. Watches</h2>
        {err("items") && <span className="err" style={{ color: "var(--error)", fontSize: 13 }}>{err("items")}</span>}
        {items.map((it, idx) => (
          <div className="card" key={idx}>
            <div className="card-head">
              <strong>Watch {idx + 1}</strong>
              {items.length > 1 && (
                <button type="button" className="btn link" style={{ minHeight: 0 }} onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                  Remove
                </button>
              )}
            </div>
            <div className="grid-3">
              {F({ k: `items.${idx}.make`, label: "Make", children: <input value={it.make} onChange={setI(idx, "make")} /> })}
              {F({ k: `items.${idx}.model`, label: "Model", children: <input value={it.model} onChange={setI(idx, "model")} /> })}
              {F({ k: `items.${idx}.reference`, label: "Reference", children: <input value={it.reference} onChange={setI(idx, "reference")} /> })}
              {F({ k: `items.${idx}.serial`, label: "Serial", children: <input value={it.serial} onChange={setI(idx, "serial")} /> })}
              {F({ k: `items.${idx}.year`, label: "Year", children: <input value={it.year} onChange={setI(idx, "year")} placeholder="e.g. 1991 or c1991" /> })}
              {F({ k: `items.${idx}.insuredValue`, label: "Insured Value (£)", children: <input inputMode="decimal" value={it.insuredValue} onChange={setI(idx, "insuredValue")} placeholder="Optional" /> })}
              {F({ k: `items.${idx}.boxPapers`, label: "Box and papers", children: <input value={it.boxPapers} onChange={setI(idx, "boxPapers")} /> })}
              {F({ k: `items.${idx}.accessories`, label: "Accessories", children: <input value={it.accessories} onChange={setI(idx, "accessories")} /> })}
              {F({ k: `items.${idx}.disclosures`, label: "Disclosed matters", children: <input value={it.disclosures} onChange={setI(idx, "disclosures")} placeholder="None known" /> })}
            </div>
          </div>
        ))}
        <button type="button" className="btn secondary dashed" style={{ alignSelf: "flex-start", fontSize: 13 }} onClick={() => setItems([...items, emptyItem()])}>
          + Add another watch
        </button>
      </section>

      {/* 3. Commercial terms */}
      <section className="form-section">
        <h2 className="section-title">3. Commercial terms</h2>
        <div className="pills" role="group" aria-label="Commission basis">
          {BASES.map((b) => (
            <button key={b.id} type="button" className="pill" aria-pressed={basis === b.id} onClick={() => setBasis(b.id)}>
              {b.label}
            </button>
          ))}
        </div>
        <div className="grid-3">
          {(basis === "percent" || basis === "min") &&
            F({ k: "terms.percent", label: "Commission (%)", children: <input inputMode="decimal" value={terms.percent} onChange={setT("percent")} /> })}
          {(basis === "net" || basis === "min") &&
            F({
              k: "terms.amount",
              label: basis === "net" ? "Net price to consignor (£)" : "Minimum return (£)",
              children: <input inputMode="decimal" value={terms.amount} onChange={setT("amount")} />,
            })}
          {basis === "bespoke" &&
            F({ k: "terms.bespoke", label: "Commission wording", wide: true, children: <textarea rows={3} value={terms.bespoke} onChange={setT("bespoke")} /> })}
        </div>
        <div className="wording">
          <span className="k">Appears on the form as</span>
          <span className="v">{wording}</span>
        </div>
        <div className="grid-3">
          {F({ k: "terms.periodDays", label: `Initial period (days, min. ${brand.defaults.minPeriodDays})`, children: <input inputMode="numeric" value={terms.periodDays} onChange={setT("periodDays")} /> })}
          {F({ k: "terms.listingPrice", label: "Initial listing price (£, optional)", children: <input inputMode="decimal" value={terms.listingPrice} onChange={setT("listingPrice")} /> })}
          {F({ k: "terms.preApprovedPrice", label: "Pre-approved price (£, optional)", children: <input inputMode="decimal" value={terms.preApprovedPrice} onChange={setT("preApprovedPrice")} /> })}
        </div>
        {F({ k: "terms.specialTerms", label: "Special terms (optional)", children: <textarea rows={2} value={terms.specialTerms} onChange={setT("specialTerms")} placeholder="None" /> })}
      </section>

      {/* 4. Message */}
      <section className="form-section">
        <h2 className="section-title">4. Personal note in the email (optional)</h2>
        {F({ k: "note", label: "Added to the email above the signing button", children: <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /> })}
      </section>

      {showPreview && (
        <section className="form-section">
          <h2 className="section-title">Preview</h2>
          {check.success ? (
            <iframe className="preview-frame" title="Agreement preview" srcDoc={previewHtml} sandbox="" />
          ) : (
            <div className="notice error">Some details are missing or not right yet: {check.error.issues.slice(0, 3).map((i) => i.message).join("; ")}.</div>
          )}
        </section>
      )}

      <div className="actions">
        <button type="button" className="btn secondary" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? "Hide preview" : "Preview the form"}
        </button>
        <button className="btn" type="submit" name="mode" value="email" disabled={pending}>
          {pending ? "Creating…" : "Send for signature"}
        </button>
        <button className="btn secondary" type="submit" name="mode" value="in-person" disabled={pending}>
          Sign in person on this device
        </button>
      </div>
    </form>
  );
}
