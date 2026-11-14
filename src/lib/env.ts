import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing setting: ${name}. Add it to the hosting environment variables.`);
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export const env = {
  appUrl: () => optional("APP_URL", "http://localhost:3000").replace(/\/+$/, ""),
  adminPassword: () => required("ADMIN_PASSWORD"),
  sessionSecret: () => {
    const s = required("SESSION_SECRET");
    if (s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
    return s;
  },
  docusealKey: () => required("DOCUSEAL_API_KEY"),
  docusealApiUrl: () => optional("DOCUSEAL_API_URL", "https://api.docuseal.com").replace(/\/+$/, ""),
  docusealAppUrl: () => optional("DOCUSEAL_APP_URL", "https://docuseal.com").replace(/\/+$/, ""),
  webhookSecret: () => required("DOCUSEAL_WEBHOOK_SECRET"),
  companySigner: () => ({
    name: optional("COMPANY_SIGNER_NAME", "Tommy Zhao"),
    title: optional("COMPANY_SIGNER_TITLE", "Director"),
    email: required("COMPANY_SIGNER_EMAIL"),
  }),
  /** On by default: your typed signature is on the form when it is sent. Set COMPANY_PRESIGN=false to countersign instead. */
  presign: () => (process.env.COMPANY_PRESIGN ?? "true").trim().toLowerCase() !== "false",
  resendKey: () => process.env.RESEND_API_KEY?.trim() || "",
  emailFrom: () => required("EMAIL_FROM"),
  emailReplyTo: () => optional("EMAIL_REPLY_TO", ""),
};
