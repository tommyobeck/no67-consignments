import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env.ts";
import { ROLES, SUBMISSION_PREFIX } from "@/lib/brand.ts";
import { getSubmission, listSubmittersForSubmission, readSummary, signPageUrl } from "@/lib/docuseal.ts";
import { sendCompletedCopy, sendCountersignRequest } from "@/lib/email.ts";

export const dynamic = "force-dynamic";

/**
 * DocuSeal calls this address when someone signs.
 * Set it up in DocuSeal → Settings → Webhooks:
 *   URL:    {APP_URL}/api/webhooks/docuseal
 *   Events: form.completed, submission.completed
 *   Secret: header "X-Webhook-Secret" with the value of DOCUSEAL_WEBHOOK_SECRET
 */

function secretOk(req: NextRequest): boolean {
  const got = req.headers.get("x-webhook-secret") ?? "";
  const want = env.webhookSecret();
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(want).digest();
  return got.length > 0 && timingSafeEqual(a, b);
}

type Payload = { event_type?: string; data?: { id?: number; submission_id?: number; role?: string; submission?: { id?: number } } };

export async function POST(req: NextRequest) {
  if (!secretOk(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  try {
    if (body.event_type === "form.completed" && body.data?.role === ROLES.consignor) {
      await onConsignorSigned(Number(body.data.submission_id ?? body.data.submission?.id));
    } else if (body.event_type === "submission.completed") {
      await onCompleted(Number(body.data?.id));
    }
  } catch (err) {
    console.error("[webhook] failed", body.event_type, err);
    // A 500 makes DocuSeal retry later.
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

async function onConsignorSigned(submissionId: number) {
  if (!Number.isInteger(submissionId) || submissionId <= 0) return;
  const signers = await listSubmittersForSubmission(submissionId);
  const consignor = signers.find((s) => s.role === ROLES.consignor);
  const company = signers.find((s) => s.role === ROLES.company);
  if (!consignor || !company || company.status === "completed") return;
  if (consignor.metadata?.kind !== "consignor") return; // not one of ours
  await sendCountersignRequest({
    to: env.companySigner().email,
    summary: readSummary(consignor),
    signUrl: signPageUrl(company.slug),
    adminUrl: `${env.appUrl()}/admin/agreements/${submissionId}`,
  });
}

async function onCompleted(submissionId: number) {
  if (!Number.isInteger(submissionId) || submissionId <= 0) return;
  const sub = await getSubmission(submissionId);
  if (!(sub.name ?? "").startsWith(SUBMISSION_PREFIX)) return;
  const consignor = sub.submitters.find((s) => s.role === ROLES.consignor);
  if (!consignor) return;
  const summary = readSummary(consignor);

  // Attach the signed PDF (documents plus audit certificate) when DocuSeal provides it.
  let pdf: { filename: string; base64: string } | undefined;
  if (sub.combined_document_url) {
    try {
      const res = await fetch(sub.combined_document_url, { cache: "no-store" });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 30 * 1024 * 1024) {
          pdf = { filename: `Consignment ${summary.ref ?? submissionId} (signed).pdf`, base64: buf.toString("base64") };
        }
      }
    } catch (err) {
      console.warn("[webhook] could not download the signed PDF; sending a link instead", err);
    }
  }
  const downloadUrl = sub.combined_document_url ?? sub.documents?.[0]?.url;

  if (consignor.email) {
    await sendCompletedCopy({ to: consignor.email, summary, pdf, downloadUrl });
  }
  await sendCompletedCopy({ to: env.companySigner().email, summary, pdf, downloadUrl, forCompany: true });
}
