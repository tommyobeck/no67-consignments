import type { Metadata } from "next";
import Link from "next/link";
import { DOC_TYPES } from "@/lib/brand.ts";
import { listAgreements, partySigner, readSummary, type DsSubmission } from "@/lib/docuseal.ts";

export const metadata: Metadata = { title: "Agreements" };

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

function waitingOn(s: DsSubmission): { label: string; tone: string } {
  if (s.status === "completed") return { label: "Signed", tone: "completed" };
  if (s.status === "declined") return { label: "Declined", tone: "declined" };
  if (s.status === "expired") return { label: "Expired", tone: "expired" };
  const party = partySigner(s.submitters);
  const noun = DOC_TYPES[(party ? readSummary(party).docType : undefined) ?? "consignment"].partyNoun.toLowerCase();
  if (party?.status === "completed") return { label: "Ready for you to countersign", tone: "pending" };
  if (party?.status === "opened") return { label: `Opened by ${noun}`, tone: "pending" };
  return { label: `Waiting for ${noun}`, tone: "pending" };
}

export default async function AgreementsPage({ searchParams }: { searchParams: Promise<{ view?: string; cancelled?: string }> }) {
  const sp = await searchParams;
  const signed = sp.view === "signed";
  let rows: DsSubmission[] = [];
  let loadError = "";
  try {
    rows = await listAgreements(signed ? "completed" : "pending");
  } catch (err) {
    loadError = (err as Error).message;
  }

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <h1>{signed ? "Signed agreements" : "Awaiting signature"}</h1>
        <Link className="btn" href="/admin/new">
          New agreement
        </Link>
      </div>

      {sp.cancelled && <div className="notice">The agreement was cancelled. Its signing link no longer works.</div>}
      {loadError && <div className="notice error">Could not load agreements from DocuSeal: {loadError}</div>}

      <div className="table-wrap">
        {rows.length === 0 && !loadError ? (
          <div className="empty">{signed ? "Nothing signed yet." : "Nothing waiting for a signature."}</div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Watch</th>
                <th>Status</th>
                <th>{signed ? "Completed" : "Sent"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const consignor = partySigner(s.submitters);
                const sum = consignor ? readSummary(consignor) : {};
                const st = waitingOn(s);
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/admin/agreements/${s.id}`}>{sum.consignorName ?? consignor?.name ?? s.name}</Link>
                      <div className="fine">{sum.ref}</div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{DOC_TYPES[sum.docType ?? "consignment"].heading}</td>
                    <td>{sum.watch ?? ""}</td>
                    <td>
                      <span className={`status ${st.tone}`}>{st.label}</span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(signed ? s.completed_at : s.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
