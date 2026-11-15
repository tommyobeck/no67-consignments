"use client";

import { useActionState, useMemo, useState } from "react";
import { buildPurchaseHtml, purchaseSchema } from "@/lib/purchase.ts";
import { formatMoney, type CompanySigner } from "@/lib/document.ts";
import { createDocument, type CreateState } from "../actions.ts";
import { emptyParty, fieldRenderer, PartyFields, PreviewAndActions, useFieldErrors, type PartyDraft } from "./formKit.tsx";

type ItemDraft = { make: string; model: string; reference: string; serial: string; year: string; accessories: string; note: string; price: string };
const emptyItem = (): ItemDraft => ({ make: "", model: "", reference: "", serial: "", year: "", accessories: "", note: "", price: "" });

export function NewPurchaseForm({ signer }: { signer: CompanySigner }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createDocument, {});
  const [ptype, setPtype] = useState<"individual" | "company">("individual");
  const [seller, setSeller] = useState<PartyDraft>(emptyParty());
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [delivery, setDelivery] = useState<"seller" | "collect">("seller");
  const [acceptance, setAcceptance] = useState<"inspect" | "accepted">("inspect");
  const [specialTerms, setSpecialTerms] = useState("");
  const [note, setNote] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const payload = useMemo(
    () => ({ seller: { type: ptype, ...seller }, items, delivery, acceptance, specialTerms, note }),
    [ptype, seller, items, delivery, acceptance, specialTerms, note],
  );
  const check = useMemo(() => purchaseSchema.safeParse(payload), [payload]);
  const err = useFieldErrors(state.errors, check);
  const F = fieldRenderer(err);

  const total = items.reduce((s, i) => {
    const n = Number(i.price.replace(/[£,\s]/g, ""));
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  const previewHtml = useMemo(() => {
    if (!showPreview || !check.success) return "";
    return buildPurchaseHtml(check.data, { ref: "PREVIEW", companySigner: signer, preview: true });
  }, [showPreview, check, signer]);

  const setI = (idx: number, k: keyof ItemDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, [k]: e.target.value } : it)));

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 36 }} noValidate>
      <input type="hidden" name="docType" value="purchase" />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {state.formError && (
        <div className="notice error" role="alert">
          {state.formError}
        </div>
      )}

      <section className="form-section">
        <h2 className="section-title">1. Seller</h2>
        <PartyFields prefix="seller" type={ptype} setType={setPtype} value={seller} setValue={setSeller} F={F} />
      </section>

      <section className="form-section">
        <h2 className="section-title">2. Watches and price</h2>
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
              {F({ k: `items.${idx}.price`, label: "Price (£)", children: <input inputMode="decimal" value={it.price} onChange={setI(idx, "price")} /> })}
              {F({ k: `items.${idx}.accessories`, label: "Accessories", children: <input value={it.accessories} onChange={setI(idx, "accessories")} placeholder="e.g. box, papers, hang tag" /> })}
              {F({ k: `items.${idx}.note`, label: "Note (optional)", children: <input value={it.note} onChange={setI(idx, "note")} placeholder="e.g. serviced 2024" /> })}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <button type="button" className="btn secondary dashed" style={{ fontSize: 13 }} onClick={() => setItems([...items, emptyItem()])}>
            + Add another watch
          </button>
          {items.length > 1 && <strong style={{ fontWeight: 500 }}>Total {formatMoney(total)}</strong>}
        </div>
      </section>

      <section className="form-section">
        <h2 className="section-title">3. Options</h2>
        <div className="field">
          <span>Delivery</span>
          <div className="pills" role="group" aria-label="Delivery">
            <button type="button" className="pill" aria-pressed={delivery === "seller"} onClick={() => setDelivery("seller")}>
              Seller brings it
            </button>
            <button type="button" className="pill" aria-pressed={delivery === "collect"} onClick={() => setDelivery("collect")}>
              We collect by courier
            </button>
          </div>
        </div>
        <div className="field">
          <span>Acceptance</span>
          <div className="pills" role="group" aria-label="Acceptance">
            <button type="button" className="pill" aria-pressed={acceptance === "inspect"} onClick={() => setAcceptance("inspect")}>
              3 business days to inspect
            </button>
            <button type="button" className="pill" aria-pressed={acceptance === "accepted"} onClick={() => setAcceptance("accepted")}>
              Accepted on signing
            </button>
          </div>
        </div>
        {F({ k: "specialTerms", label: "Special terms (optional)", children: <textarea rows={2} value={specialTerms} onChange={(e) => setSpecialTerms(e.target.value)} placeholder="None" /> })}
      </section>

      <section className="form-section">
        <h2 className="section-title">4. Personal note in the email (optional)</h2>
        {F({ k: "note", label: "Added to the email above the signing button", children: <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /> })}
      </section>

      <PreviewAndActions showPreview={showPreview} setShowPreview={setShowPreview} check={check} previewHtml={previewHtml} pending={pending} />
    </form>
  );
}
