import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOC_TYPES, ROLES, isOurSubmissionName } from "@/lib/brand.ts";
import { DocusealError, getSubmission, partySigner, readSummary, signPageUrl, type DsSubmitter } from "@/lib/docuseal.ts";
import { cancelAgreement, resendInvite } from "../../actions.ts";
import { CopyLink } from "./CopyLink.tsx";
import { ConfirmButton } from "./ConfirmButton.tsx";

export const metadata: Metadata = { title: "Agreement" };

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

function signerStatus(s: DsSubmitter | undefined): string {
  if (!s) return "";
  if (s.completed_at) return `Signed ${when(s.completed_at)}`;
  if (s.declined_at) return `Declined ${when(s.declined_at)}`;
  if (s.opened_at) return `Opened ${when(s.opened_at)}, not signed yet`;
  return "Not opened yet";
}

const EMAIL_NOTES: Record<string, { text: string; error?: boolean }> = {
  sent: { text: "The signing email has been sent." },
  "not-configured": { text: "It was created, but email sending is not set up yet. Copy the signing link below and send it yourself.", error: true },
  failed: { text: "It was created, but the email could not be sent. Copy the signing link below and send it yourself, or try again.", error: true },
};

export default async function AgreementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; email?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) notFound();

  let sub;
  try {
    sub = await getSubmission(num);
  } catch (err) {
    if (err instanceof DocusealError && err.status === 404) notFound();
    throw err;
  }
  if (!isOurSubmissionName(sub.name)) notFound();

  const consignor = partySigner(sub.submitters);
  const company = sub.submitters.find((s) => s.role === ROLES.company);
  const sum = consignor ? readSummary(consignor) : {};
  const T = DOC_TYPES[sum.docType ?? "consignment"];
  const emailNote = sp.email ? EMAIL_NOTES[sp.email] : undefined;
  const done = sub.status === "completed";
  const consignorSigned = consignor?.status === "completed";

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <p className="eyebrow">
          <Link href={done ? "/admin?view=signed" : "/admin"}>Agreements</Link> · {T.heading} · {sum.ref}
        </p>
        <h1>{sum.consignorName ?? consignor?.name}</h1>
      </div>

      {sp.created && (
        <div className="notice">
          {T.heading} {sum.ref} created.
        </div>
      )}
      {emailNote && <div className={`notice${emailNote.error ? " error" : ""}`}>{emailNote.text}</div>}

      <dl className="kv">
        <dt>Watch</dt>
        <dd>{sum.watch}</dd>
        {(sum.facts ?? []).map(([k, v]) => (
          <Fact key={k} k={k} v={v} />
        ))}
        <dt>{T.partyNoun}</dt>
        <dd>
          {consignor?.email}
          <div className="fine">{signerStatus(consignor)}</div>
        </dd>
        <dt>Countersignature</dt>
        <dd>
          {sum.presigned === "yes"
            ? "Signed when sent"
            : company?.completed_at
              ? `Signed ${when(company.completed_at)}`
              : consignorSigned
                ? "Ready for you"
                : `After the ${T.partyNoun.toLowerCase()} signs`}
        </dd>
        <dt>Created</dt>
        <dd>{when(sub.created_at)}</dd>
      </dl>

      <div className="actions">
        {done ? (
          <>
            {sub.combined_document_url && (
              <a className="btn" href={sub.combined_document_url} target="_blank" rel="noreferrer">
                Download signed PDF
              </a>
            )}
            {sub.audit_log_url && (
              <a className="btn secondary" href={sub.audit_log_url} target="_blank" rel="noreferrer">
                Audit certificate
              </a>
            )}
          </>
        ) : (
          <>
            {consignorSigned && company && (
              <a className="btn" href={`/sign/${company.slug}`}>
                Countersign now
              </a>
            )}
            {!consignorSigned && consignor && (
              <>
                <CopyLink url={signPageUrl(consignor.slug)} />
                <a className="btn secondary" href={`/sign/${consignor.slug}`}>
                  Open signing on this device
                </a>
                <form action={resendInvite}>
                  <input type="hidden" name="id" value={sub.id} />
                  <button className="btn secondary" type="submit">
                    Email the link again
                  </button>
                </form>
              </>
            )}
            <form action={cancelAgreement}>
              <input type="hidden" name="id" value={sub.id} />
              <ConfirmButton className="btn link" message="Cancel this? The signing link will stop working. This cannot be undone.">
                Cancel this agreement
              </ConfirmButton>
            </form>
          </>
        )}
      </div>
    </>
  );
}
