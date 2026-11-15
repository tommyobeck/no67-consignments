"use client";

import { cloneElement, useMemo } from "react";

type Check = { success: true } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };

/** An error from the last submit shows only while that field is still wrong. */
export function useFieldErrors(stateErrors: Record<string, string> | undefined, check: Check) {
  const stillWrong = useMemo(
    () => new Set(check.success ? [] : check.error.issues.map((i) => i.path.map(String).join("."))),
    [check],
  );
  return (k: string) => (stillWrong.has(k) ? (stateErrors ?? {})[k] : undefined);
}

export type FieldFn = (opts: { k: string; label: string; children: React.ReactElement<Record<string, unknown>>; wide?: boolean }) => React.ReactElement;

/** Each field: a label tied to its input, and any error linked for screen readers. */
export function fieldRenderer(err: (k: string) => string | undefined): FieldFn {
  return function Field({ k, label, children, wide }) {
    const id = `f-${k.replace(/\./g, "-")}`;
    const errId = `${id}-err`;
    const control = cloneElement(children, { id, "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? errId : undefined });
    return (
      <div className={`field${err(k) ? " has-error" : ""}`} style={wide ? { gridColumn: "1 / -1" } : undefined} key={k}>
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
}

export type PartyDraft = { name: string; signatoryName: string; signatoryRole: string; email: string; phone: string; address: string };
export const emptyParty = (): PartyDraft => ({ name: "", signatoryName: "", signatoryRole: "", email: "", phone: "", address: "" });

export function PartyFields({
  prefix,
  type,
  setType,
  value,
  setValue,
  F,
}: {
  prefix: string;
  type: "individual" | "company";
  setType: (t: "individual" | "company") => void;
  value: PartyDraft;
  setValue: (v: PartyDraft) => void;
  F: FieldFn;
}) {
  const set = (k: keyof PartyDraft) => (e: React.ChangeEvent<HTMLInputElement>) => setValue({ ...value, [k]: e.target.value });
  return (
    <>
      <div className="pills" role="group" aria-label="Selling as">
        <button type="button" className="pill" aria-pressed={type === "individual"} onClick={() => setType("individual")}>
          Private individual
        </button>
        <button type="button" className="pill" aria-pressed={type === "company"} onClick={() => setType("company")}>
          Company or business
        </button>
      </div>
      <div className="grid-2">
        {F({ k: `${prefix}.name`, label: type === "company" ? "Company name" : "Full name", children: <input value={value.name} onChange={set("name")} autoComplete="off" /> })}
        {F({ k: `${prefix}.email`, label: "Email", children: <input type="email" value={value.email} onChange={set("email")} autoComplete="off" /> })}
        {type === "company" && F({ k: `${prefix}.signatoryName`, label: "Person signing", children: <input value={value.signatoryName} onChange={set("signatoryName")} /> })}
        {type === "company" &&
          F({ k: `${prefix}.signatoryRole`, label: "Their position", children: <input value={value.signatoryRole} onChange={set("signatoryRole")} placeholder="e.g. Director" /> })}
        {F({ k: `${prefix}.phone`, label: "Telephone", children: <input type="tel" value={value.phone} onChange={set("phone")} /> })}
        {F({ k: `${prefix}.address`, label: "Address", children: <input value={value.address} onChange={set("address")} /> })}
      </div>
    </>
  );
}

export function PreviewAndActions({
  showPreview,
  setShowPreview,
  check,
  previewHtml,
  pending,
}: {
  showPreview: boolean;
  setShowPreview: (f: (v: boolean) => boolean) => void;
  check: Check;
  previewHtml: string;
  pending: boolean;
}) {
  return (
    <>
      {showPreview && (
        <section className="form-section">
          <h2 className="section-title">Preview</h2>
          {check.success ? (
            <iframe className="preview-frame" title="Document preview" srcDoc={previewHtml} sandbox="" />
          ) : (
            <div className="notice error">
              Some details are missing or not right yet:{" "}
              {check.error.issues
                .slice(0, 3)
                .map((i) => i.message)
                .join("; ")}
              .
            </div>
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
    </>
  );
}
