import type { Metadata } from "next";
import { env } from "@/lib/env.ts";
import { NewAgreementForm } from "./NewAgreementForm.tsx";

export const metadata: Metadata = { title: "New agreement" };

export default function NewAgreementPage() {
  const signer = env.companySigner();
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1>New consignment agreement</h1>
        <p className="fine" style={{ margin: 0, fontSize: 14 }}>
          The standard terms are fixed. Everything below goes on the Consignment Form.
        </p>
      </div>
      <NewAgreementForm signer={{ name: signer.name, title: signer.title }} />
    </>
  );
}
