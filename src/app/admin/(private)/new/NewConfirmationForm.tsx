"use client";

import { useActionState, useMemo, useState } from "react";
import { buildConfirmationHtml, confirmationSchema } from "@/lib/confirmation.ts";
import { formatMoney, type CompanySigner } from "@/lib/document.ts";
import { createDocument, type CreateState } from "../actions.ts";
import { fieldRenderer, PreviewAndActions, useFieldErrors } from "./formKit.tsx";

export type SignedConsignment = { ref: string; name: string; email: string; watch: string };

type ItemDraft = { make: string; model: string; reference: string; serial: string; sellingPrice: string; deductions: string };
const emptyItem = (): ItemDraft => ({ make: "", model: "", reference: "", serial: "", sellingPrice: "", deductions: "" });

const num = (v: string) => {
  const n = Number(v.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

export function NewConfirmationForm({ signer, consignments }: { signer: CompanySigner; consignments: SignedConsignment[] }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createDocument, {});
  const [picked, setPicked] = useState("");
  const [consignor, setConsignor] = useState({ name: "", email: "" });
  const [consignmentRef, setConsignmentRef] = useState("");
  const [saleDate, setSaleDate] = useState(todayISO());
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [note, setNote] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const payload = useMemo(() => ({ consignor, consignmentRef, saleDate, items, note }), [consignor, consignmentRef, saleDate, items, note]);
  const check = useMemo(() => confirmationSchema.safeParse(payload), [payload]);
  const err = useFieldErrors(state.errors, check);
  const F = fieldRenderer(err);

  const previewHtml = useMemo(() => {
    if (!showPreview || !check.success) return "";
    return buildConfirmationHtml(check.data, { ref: "PREVIEW", companySigner: signer, preview: true });
  }, [showPreview, check, signer]);

  const setI = (idx: number, k: keyof ItemDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, [k]: e.target.value } : it)));

  const pick = (ref: string) => {
    setPicked(ref);
    const c = consignments.find((x) => x.ref === ref);
    if (c) {
      setConsignor({ name: c.name, email: c.email });
      setConsignmentRef(c.ref);
    }
  };

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 36 }} noValidate>
      <input type="hidden" name="docType" value="confirmation" />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {state.formError && (
        <div className="notice error" role="alert">
          {state.formError}
        </div>
      )}

      <section className="form-section">
        <h2 className="section-title">1. Consignment</h2>
        {consignments.length > 0 && (
          <div className="field">
            <label htmlFor="pick-consignment">Choose a signed consignment agreement</label>
            <select id="pick-consignment" value={picked} onChange={(e) => pick(e.target.value)}>
              <option value="">Select…</option>
              {consignments.map((c) => (
                <option key={c.ref} value={c.ref}>
                  {c.name} · {c.watch} · {c.ref}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid-3">
          {F({ k: "consignor.name", label: "Consignor name", children: <input value={consignor.name} onChange={(e) => setConsignor({ ...consignor, name: e.target.value })} /> })}
          {F({ k: "consignor.email", label: "Email", children: <input type="email" value={consignor.email} onChange={(e) => setConsignor({ ...consignor, email: e.target.value })} /> })}
          {F({ k: "consignmentRef", label: "Consignment agreement ref.", children: <input value={consignmentRef} onChange={(e) => setConsignmentRef(e.target.value)} placeholder="C-…" /> })}
          {F({ k: "saleDate", label: "Date of sale", children: <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} /> })}
        </div>
      </section>

      <section className="form-section">
        <h2 className="section-title">2. Watches sold</h2>
        {items.map((it, idx) => {
          const net = num(it.sellingPrice) - num(it.deductions);
          return (
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
                {F({ k: `items.${idx}.sellingPrice`, label: "Selling Price (£)", children: <input inputMode="decimal" value={it.sellingPrice} onChange={setI(idx, "sellingPrice")} /> })}
                {F({ k: `items.${idx}.deductions`, label: "Commission and expenses (£)", children: <input inputMode="decimal" value={it.deductions} onChange={setI(idx, "deductions")} /> })}
              </div>
              <div className="wording">
                <span className="k">Consignor Price</span>
                <span className="v">{it.sellingPrice ? formatMoney(net) : "—"}</span>
              </div>
            </div>
          );
        })}
        <button type="button" className="btn secondary dashed" style={{ alignSelf: "flex-start", fontSize: 13 }} onClick={() => setItems([...items, emptyItem()])}>
          + Add another watch
        </button>
      </section>

      <section className="form-section">
        <h2 className="section-title">3. Personal note in the email (optional)</h2>
        {F({ k: "note", label: "Added to the email above the signing button", children: <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /> })}
      </section>

      <PreviewAndActions showPreview={showPreview} setShowPreview={setShowPreview} check={check} previewHtml={previewHtml} pending={pending} />
    </form>
  );
}
