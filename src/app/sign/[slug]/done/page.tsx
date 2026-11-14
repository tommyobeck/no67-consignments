import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { brand, ROLES } from "@/lib/brand.ts";
import { getSubmitterBySlug, readSummary } from "@/lib/docuseal.ts";
import { Logo, SiteFooter } from "@/components/Logo.tsx";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Thank you" };

export default async function DonePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const signer = await getSubmitterBySlug(slug);
  if (!signer) notFound();
  const isCompany = signer.role === ROLES.company;
  const summary = readSummary(signer);

  return (
    <>
      <header className="site-header">
        <Logo />
      </header>
      <main className="sign-main">
        <div className="notice" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 10 }}>
          {isCompany ? (
            <>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 400 }}>Countersigned</h1>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
                The agreement is complete. The signed copy and audit certificate are being emailed to you and the consignor.{" "}
                <a href="/admin">Back to agreements</a>
              </p>
            </>
          ) : (
            <>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 400 }}>Thank you{summary.firstName ? `, ${summary.firstName}` : ""}</h1>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
                You have signed the agreement. It will be countersigned shortly, and the completed copy will be sent to you by email. Please bring photo ID
                when you deliver the watch, or reply to the email with a copy.
              </p>
            </>
          )}
        </div>
        {!isCompany && (
          <p className="fine">
            Questions? Email <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>.
          </p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
