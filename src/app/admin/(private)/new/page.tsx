import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env.ts";
import { isDocType, type DocType } from "@/lib/brand.ts";
import { listAgreements, partySigner, readSummary } from "@/lib/docuseal.ts";
import { NewAgreementForm } from "./NewAgreementForm.tsx";
import { NewPurchaseForm } from "./NewPurchaseForm.tsx";
import { NewConfirmationForm, type SignedConsignment } from "./NewConfirmationForm.tsx";

export const metadata: Metadata = { title: "New agreement" };

const CHOICES: { type: DocType; label: string; blurb: string }[] = [
  { type: "consignment", label: "Consignment", blurb: "A watch you will sell on the owner's behalf." },
  { type: "purchase", label: "Purchase", blurb: "A watch you are buying outright." },
  { type: "confirmation", label: "Consigned watch sold", blurb: "A signed record for the consignor once their watch has sold." },
];

async function signedConsignments(): Promise<SignedConsignment[]> {
  try {
    const rows = await listAgreements("completed");
    return rows
      .map((s) => {
        const p = partySigner(s.submitters);
        const sum = p ? readSummary(p) : {};
        return sum.docType === "consignment" && sum.ref
          ? { ref: sum.ref, name: sum.consignorName ?? p?.name ?? "", email: p?.email ?? "", watch: sum.watch ?? "" }
          : null;
      })
      .filter((x): x is SignedConsignment => x !== null);
  } catch {
    return [];
  }
}

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const sp = await searchParams;
  const type: DocType = isDocType(sp.type) ? sp.type : "consignment";
  const signer = env.companySigner();
  const s = { name: signer.name, title: signer.title };
  const current = CHOICES.find((c) => c.type === type)!;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h1>New agreement</h1>
        <nav className="pills" aria-label="Type of agreement">
          {CHOICES.map((c) => (
            <Link key={c.type} href={`/admin/new?type=${c.type}`} className="pill" aria-pressed={c.type === type} aria-current={c.type === type ? "page" : undefined} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              {c.label}
            </Link>
          ))}
        </nav>
        <p className="fine" style={{ margin: 0, fontSize: 14 }}>
          {current.blurb}
        </p>
      </div>
      {type === "purchase" ? (
        <NewPurchaseForm key="purchase" signer={s} />
      ) : type === "confirmation" ? (
        <NewConfirmationForm key="confirmation" signer={s} consignments={await signedConsignments()} />
      ) : (
        <NewAgreementForm key="consignment" signer={s} />
      )}
    </>
  );
}
