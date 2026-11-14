import "server-only";
import { env } from "./env.ts";
import { ROLES, SUBMISSION_PREFIX } from "./brand.ts";
import type { AgreementSummary } from "./agreement.ts";

// Only the fields this app uses. Full reference: https://www.docuseal.com/docs/api
export type SubmitterStatus = "completed" | "declined" | "opened" | "sent" | "awaiting";
export type SubmissionStatus = "completed" | "declined" | "expired" | "pending";

export type DsDocument = { name: string; url: string };

export type DsSubmitter = {
  id: number;
  submission_id: number;
  slug: string;
  email: string | null;
  name: string | null;
  role: string;
  status: SubmitterStatus;
  sent_at: string | null;
  opened_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  external_id: string | null;
  metadata: Record<string, unknown>;
  documents?: DsDocument[];
};

export type DsSubmission = {
  id: number;
  name: string | null;
  slug: string;
  status: SubmissionStatus;
  created_at: string;
  completed_at: string | null;
  archived_at: string | null;
  audit_log_url: string | null;
  combined_document_url: string | null;
  submitters: DsSubmitter[];
  documents?: DsDocument[];
};

export class DocusealError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${env.docusealApiUrl()}${path}`, {
    ...init,
    headers: {
      "X-Auth-Token": env.docusealKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error || body?.message || JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new DocusealError(`DocuSeal ${res.status}: ${detail || res.statusText}`, res.status);
  }
  return (await res.json()) as T;
}

export type CreateArgs = {
  name: string;
  html: string;
  documentName: string;
  ref: string;
  summary: AgreementSummary;
  consignor: { name: string; email: string };
  company: { name: string; email: string };
};

/**
 * Creates the signing request from the agreement HTML.
 * DocuSeal's own emails are switched off: this app sends branded emails instead.
 * Order is preserved, so the company can only countersign after the consignor has signed.
 */
export async function createAgreementSubmission(args: CreateArgs): Promise<{ submissionId: number; consignor: DsSubmitter; company: DsSubmitter }> {
  const result = await call<{ id?: number; submitters?: DsSubmitter[] } | DsSubmitter[]>("/submissions/html", {
    method: "POST",
    body: JSON.stringify({
      name: args.name,
      send_email: false,
      order: "preserved",
      documents: [{ name: args.documentName, html: args.html, size: "A4" }],
      submitters: [
        {
          role: ROLES.consignor,
          name: args.consignor.name,
          email: args.consignor.email,
          external_id: `${args.ref}:consignor`,
          send_email: false,
          metadata: { ...args.summary, kind: "consignor" },
        },
        {
          role: ROLES.company,
          name: args.company.name,
          email: args.company.email,
          external_id: `${args.ref}:company`,
          send_email: false,
          metadata: { ref: args.ref, kind: "company" },
        },
      ],
    }),
  });
  // The API has returned both shapes over time: an object with submitters, or a bare list.
  const submitters = Array.isArray(result) ? result : result.submitters ?? [];
  const consignor = submitters.find((s) => s.role === ROLES.consignor);
  const company = submitters.find((s) => s.role === ROLES.company);
  if (!consignor || !company) throw new DocusealError("DocuSeal did not return both signers.", 500);
  const submissionId = (!Array.isArray(result) && result.id) || consignor.submission_id;
  return { submissionId, consignor, company };
}

export async function getSubmission(id: number): Promise<DsSubmission> {
  return call<DsSubmission>(`/submissions/${encodeURIComponent(String(id))}`);
}

export async function listAgreements(status?: SubmissionStatus): Promise<DsSubmission[]> {
  const params = new URLSearchParams({ limit: "100" });
  if (status) params.set("status", status);
  const out = await call<{ data: DsSubmission[] }>(`/submissions?${params.toString()}`);
  return out.data.filter((s) => (s.name ?? "").startsWith(SUBMISSION_PREFIX) && !s.archived_at);
}

export async function getSubmitterBySlug(slug: string): Promise<DsSubmitter | null> {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(slug)) return null;
  const out = await call<{ data: DsSubmitter[] }>(`/submitters?slug=${encodeURIComponent(slug)}&limit=1`);
  const found = out.data[0];
  // Only serve signers that belong to a consignment agreement.
  if (!found || found.slug !== slug) return null;
  const kind = found.metadata?.kind;
  return kind === "consignor" || kind === "company" ? found : null;
}

export async function listSubmittersForSubmission(submissionId: number): Promise<DsSubmitter[]> {
  const out = await call<{ data: DsSubmitter[] }>(`/submitters?submission_id=${encodeURIComponent(String(submissionId))}&limit=10`);
  return out.data;
}

export async function archiveSubmission(id: number): Promise<void> {
  await call(`/submissions/${encodeURIComponent(String(id))}`, { method: "DELETE" });
}

/** The address the embedded signing box loads for one signer. */
export function signingSrc(slug: string): string {
  return `${env.docusealAppUrl()}/s/${encodeURIComponent(slug)}`;
}

/** The EU cloud needs its own host on the embedded signing box. */
export function signingHost(): string | undefined {
  const host = new URL(env.docusealAppUrl()).host;
  return host === "docuseal.eu" ? "cdn.docuseal.eu" : undefined;
}

export function signPageUrl(slug: string): string {
  return `${env.appUrl()}/sign/${encodeURIComponent(slug)}`;
}

export function readSummary(s: DsSubmitter): Partial<AgreementSummary> {
  const m = s.metadata ?? {};
  const pick = (k: keyof AgreementSummary) => (typeof m[k] === "string" ? (m[k] as string) : undefined);
  return {
    ref: pick("ref"),
    consignorName: pick("consignorName"),
    firstName: pick("firstName"),
    watch: pick("watch"),
    commission: pick("commission"),
    period: pick("period"),
    insured: pick("insured"),
  };
}
