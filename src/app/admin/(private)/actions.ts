"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth.ts";
import { env } from "@/lib/env.ts";
import { ROLES } from "@/lib/brand.ts";
import { agreementSchema, buildAgreementHtml, makeReference, submissionName, summarise, type AgreementSummary } from "@/lib/agreement.ts";
import { archiveSubmission, createAgreementSubmission, getSubmission, readSummary, signPageUrl } from "@/lib/docuseal.ts";
import { sendConsignorInvite } from "@/lib/email.ts";

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

export async function createAgreement(_prev: CreateState, formData: FormData): Promise<CreateState> {
  await requireAdmin();
  const mode = formData.get("mode") === "in-person" ? "in-person" : "email";

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { formError: "The form could not be read. Please try again." };
  }
  const parsed = agreementSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: flattenIssues(parsed.error.issues), formError: "Please check the highlighted fields." };
  }
  const a = parsed.data;
  const ref = makeReference();
  const signer = env.companySigner();
  const summary = summarise(a, ref);

  let created;
  try {
    created = await createAgreementSubmission({
      name: submissionName(ref, a.consignor.name),
      documentName: `Consignment Form ${ref}`,
      html: buildAgreementHtml(a, { ref, companySigner: signer }),
      ref,
      summary,
      consignor: { name: a.consignor.type === "company" ? a.consignor.signatoryName || a.consignor.name : a.consignor.name, email: a.consignor.email },
      company: { name: signer.name, email: signer.email },
    });
  } catch (err) {
    console.error("[create] DocuSeal error", err);
    return { formError: `The agreement could not be created in DocuSeal. ${(err as Error).message}` };
  }

  if (mode === "in-person") {
    redirect(`/sign/${created.consignor.slug}`);
  }

  let emailNote = "sent";
  try {
    const result = await sendConsignorInvite({
      to: a.consignor.email,
      summary,
      signUrl: signPageUrl(created.consignor.slug),
      note: a.note,
      signerName: signer.name,
    });
    if (!result.sent) emailNote = "not-configured";
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
  const consignor = sub.submitters.find((s) => s.role === ROLES.consignor);
  if (!consignor || !consignor.email) redirect(`/admin/agreements/${id}?email=failed`);
  const summary = readSummary(consignor) as AgreementSummary;
  let note = "sent";
  try {
    const r = await sendConsignorInvite({
      to: consignor.email,
      summary,
      signUrl: signPageUrl(consignor.slug),
      signerName: env.companySigner().name,
    });
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
