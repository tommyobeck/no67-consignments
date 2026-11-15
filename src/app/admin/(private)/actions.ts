"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth.ts";
import { env } from "@/lib/env.ts";
import { DOC_TYPES, isDocType, type DocType } from "@/lib/brand.ts";
import { agreementSchema, buildAgreementHtml, summarise } from "@/lib/agreement.ts";
import { buildPurchaseHtml, purchaseSchema, summarisePurchase } from "@/lib/purchase.ts";
import { buildConfirmationHtml, confirmationSchema, summariseConfirmation } from "@/lib/confirmation.ts";
import { makeReference, submissionName, type BuildOptions, type DocSummary } from "@/lib/document.ts";
import { archiveSubmission, createAgreementSubmission, getSubmission, partySigner, readSummary, signPageUrl } from "@/lib/docuseal.ts";
import { sendSigningInvite } from "@/lib/email.ts";

export type CreateState = {
  errors?: Record<string, string>;
  formError?: string;
};

function flattenIssues(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map(String).join(".");
    if (!out[key]) out[key] = i.message;
  }
  return out;
}

type Built = {
  html: string;
  summary: DocSummary;
  party: { name: string; email: string };
  note: string;
};

/** Checks the form for one document type and turns it into the document, summary and signer. */
function build(docType: DocType, raw: unknown, ref: string, opts: BuildOptions): { ok: true; built: Built } | { ok: false; errors: Record<string, string> } {
  if (docType === "purchase") {
    const r = purchaseSchema.safeParse(raw);
    if (!r.success) return { ok: false, errors: flattenIssues(r.error.issues) };
    const p = r.data;
    return {
      ok: true,
      built: {
        html: buildPurchaseHtml(p, opts),
        summary: summarisePurchase(p, ref),
        party: { name: p.seller.type === "company" ? p.seller.signatoryName || p.seller.name : p.seller.name, email: p.seller.email },
        note: p.note,
      },
    };
  }
  if (docType === "confirmation") {
    const r = confirmationSchema.safeParse(raw);
    if (!r.success) return { ok: false, errors: flattenIssues(r.error.issues) };
    const c = r.data;
    return {
      ok: true,
      built: { html: buildConfirmationHtml(c, opts), summary: summariseConfirmation(c, ref), party: { name: c.consignor.name, email: c.consignor.email }, note: c.note },
    };
  }
  const r = agreementSchema.safeParse(raw);
  if (!r.success) return { ok: false, errors: flattenIssues(r.error.issues) };
  const a = r.data;
  return {
    ok: true,
    built: {
      html: buildAgreementHtml(a, opts),
      summary: summarise(a, ref),
      party: { name: a.consignor.type === "company" ? a.consignor.signatoryName || a.consignor.name : a.consignor.name, email: a.consignor.email },
      note: a.note,
    },
  };
}

export async function createDocument(_prev: CreateState, formData: FormData): Promise<CreateState> {
  await requireAdmin();
  const mode = formData.get("mode") === "in-person" ? "in-person" : "email";
  const typeRaw = formData.get("docType");
  const docType: DocType = isDocType(typeRaw) ? typeRaw : "consignment";
  const T = DOC_TYPES[docType];

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { formError: "The form could not be read. Please try again." };
  }

  const ref = makeReference(docType);
  const signer = env.companySigner();
  const presigned = env.presign();
  const result = build(docType, raw, ref, { ref, companySigner: signer, presignedOn: presigned ? new Date() : undefined });
  if (!result.ok) return { errors: result.errors, formError: "Please check the highlighted fields." };
  const { html, party, note } = result.built;
  const summary: DocSummary = { ...result.built.summary, ...(presigned ? { presigned: "yes" } : {}) };

  let created;
  try {
    created = await createAgreementSubmission({
      docType,
      name: submissionName(docType, ref, summary.consignorName),
      documentName: `${T.title} ${ref}`,
      html,
      ref,
      summary,
      party,
      company: { name: signer.name, email: signer.email },
      presigned,
    });
  } catch (err) {
    console.error("[create] DocuSeal error", err);
    return { formError: `The ${T.label} could not be created in DocuSeal. ${(err as Error).message}` };
  }

  if (mode === "in-person") {
    redirect(`/sign/${created.party.slug}`);
  }

  let emailNote = "sent";
  try {
    const sent = await sendSigningInvite({ to: party.email, summary, signUrl: signPageUrl(created.party.slug), note, signerName: signer.name });
    if (!sent.sent) emailNote = "not-configured";
  } catch (err) {
    console.error("[create] email error", err);
    emailNote = "failed";
  }

  revalidatePath("/admin");
  redirect(`/admin/agreements/${created.submissionId}?created=1&email=${emailNote}`);
}

export async function resendInvite(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const sub = await getSubmission(id);
  const party = partySigner(sub.submitters);
  if (!party || !party.email) redirect(`/admin/agreements/${id}?email=failed`);
  const summary = readSummary(party) as DocSummary;
  let note = "sent";
  try {
    const r = await sendSigningInvite({ to: party.email, summary, signUrl: signPageUrl(party.slug), signerName: env.companySigner().name });
    if (!r.sent) note = "not-configured";
  } catch (err) {
    console.error("[resend] email error", err);
    note = "failed";
  }
  redirect(`/admin/agreements/${id}?email=${note}`);
}

export async function cancelAgreement(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await archiveSubmission(id);
  revalidatePath("/admin");
  redirect("/admin?cancelled=1");
}
