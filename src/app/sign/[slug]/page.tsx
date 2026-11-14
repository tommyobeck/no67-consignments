import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { brand, ROLES } from "@/lib/brand.ts";
import { getSubmitterBySlug, listSubmittersForSubmission, readSummary, signingHost, signingSrc } from "@/lib/docuseal.ts";
import { requireAdmin } from "@/lib/auth.ts";
import { env } from "@/lib/env.ts";
import { Logo, SiteFooter } from "@/components/Logo.tsx";
import { SigningBox } from "./SigningBox.tsx";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your consignment agreement" };

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="1" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export default async function SignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const signer = await getSubmitterBySlug(slug);
  if (!signer) notFound();

  const isCompany = signer.role === ROLES.company;
  if (isCompany) await requireAdmin(); // only you can countersign

  // The consignor's signer carries the summary; for the company page, look it up.
  let consignor = isCompany ? null : signer;
  if (isCompany) {
    const all = await listSubmittersForSubmission(signer.submission_id);
    consignor = all.find((s) => s.role === ROLES.consignor) ?? null;
  }
  const summary = consignor ? readSummary(consignor) : {};
  const ref = summary.ref ?? "";
  const doneUrl = `/sign/${encodeURIComponent(slug)}/done`;

  const presigned = summary.presigned === "yes";
  const waitingForConsignor = isCompany && consignor?.status !== "completed";
  const alreadySigned = signer.status === "completed";
  const declined = signer.status === "declined";

  return (
    <>
      <div className="topbar">
        <span>Consignment agreement{ref ? ` · Ref. ${ref}` : ""}</span>
        <span>
          <LockIcon />
          Secure signing
        </span>
      </div>
      <header className="site-header">
        <Logo />
      </header>

      <main className="sign-main">
        <ol className="steps" aria-label="Progress">
          <li className={alreadySigned || isCompany ? "done" : "current"}>
            <span className="dot">1</span>Review and sign
          </li>
          <li className={presigned || isCompany ? (presigned || alreadySigned ? "done" : "current") : ""}>
            <span className="dot">2</span>
            {presigned ? `Signed by ${brand.name}` : `Countersigned by ${brand.name}`}
          </li>
          <li className={alreadySigned && isCompany ? "done" : ""}>
            <span className="dot">3</span>Completed copy by email
          </li>
        </ol>

        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {summary.consignorName && <p className="eyebrow">{isCompany ? `Countersign · ${summary.consignorName}` : `For ${summary.consignorName}`}</p>}
          <h1 className="display">{isCompany ? "Countersign the agreement" : "Your consignment agreement"}</h1>
          {!isCompany && (
            <p className="lede">
              {presigned
                ? `Please review the agreement below and sign at the end. It has already been signed by ${env.companySigner().name.split(/\s+/)[0]}, so once you sign, you will both receive the completed agreement by email.`
                : `Please review the agreement below and sign at the end. Once you have signed, ${env.companySigner().name.split(/\s+/)[0]} will countersign and you will both receive the completed agreement by email.`}
            </p>
          )}
        </section>

        {(summary.watch || summary.commission) && (
          <section aria-label="Summary" className="summary-grid">
            {summary.watch && (
              <div>
                <span className="k">Watch</span>
                <span className="v">{summary.watch}</span>
              </div>
            )}
            {summary.commission && (
              <div>
                <span className="k">Commission</span>
                <span className="v">{summary.commission}</span>
              </div>
            )}
            {summary.period && (
              <div>
                <span className="k">Initial period</span>
                <span className="v">{summary.period}</span>
              </div>
            )}
            {summary.insured && (
              <div>
                <span className="k">Insured value</span>
                <span className="v">{summary.insured}</span>
              </div>
            )}
          </section>
        )}

        {declined ? (
          <div className="notice error">This agreement was declined. Please get in touch at {brand.contactEmail} if this was a mistake.</div>
        ) : alreadySigned ? (
          <div className="notice">
            {isCompany ? "You have already countersigned this agreement." : presigned
                ? "You have already signed this agreement. The completed copy has been sent to you by email."
                : "You have already signed this agreement. The completed copy will be sent to you by email once it has been countersigned."}
          </div>
        ) : waitingForConsignor ? (
          <div className="notice">The consignor has not signed yet. You will get an email as soon as they do.</div>
        ) : (
          <>
            <div className="signing-frame">
              <SigningBox src={signingSrc(slug)} email={signer.email ?? undefined} doneUrl={doneUrl} host={signingHost()} />
            </div>
            <p className="fine">
              Read the full{" "}
              <a href={brand.terms.url} target="_blank" rel="noreferrer">
                {brand.terms.title}
              </a>{" "}
              (version {brand.terms.version}). Your email address and the time of signing are recorded in a secure audit certificate attached to the completed
              agreement.
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
