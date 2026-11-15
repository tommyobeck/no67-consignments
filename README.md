# No. 67 consignments

Own-brand agreements for three kinds of deal, chosen at the top of **New agreement**:

- **Consignment:** the Consignment Form, which refers to the Consignment Terms on the website.
- **Purchase:** a self-contained Purchase Agreement for watches bought outright (`src/lib/purchase.ts`).
- **Consigned watch sold:** a short Purchase Confirmation recording the purchase under clause 2.3 of a consignment agreement (`src/lib/confirmation.ts`). Pick the signed consignment from the list to fill in the consignor.

For each one: you fill in a private form, the consignor signs on a page in the No. 67 style, you countersign, and both of you get the signed PDF by email. DocuSeal handles the signature, audit trail and sealed PDF behind the scenes.

## How it works

1. **Private form** (`/admin/new`, password protected). Enter the consignor, the watches and the commercial terms. You can preview the Consignment Form before sending.
2. **Send for signature.** The app builds the Consignment Form, creates a signing request in DocuSeal with two signers in order (Consignor, then Company), and emails the consignor a link to `/sign/…` on your own domain. DocuSeal's own emails are switched off.
3. **Consignor signs** on the signing page. Your signature (your name, typed in a signature font, with the date) is already on the form when it is sent.
4. **Completed.** DocuSeal tells the app (webhook), and the app emails the signed PDF and audit certificate to the consignor and to you.

To countersign each agreement yourself instead, add the setting `COMPANY_PRESIGN=false`. The consignor then signs first, you get a "Ready to countersign" email, and the countersigning page only works when you are signed in.

The lists of agreements (Awaiting signature, Signed) are read straight from DocuSeal, so there is no separate database to look after.

**Sign in person on this device** skips the email and opens the signing page straight away, for example on an iPad in the showroom.

## Changing things

| What | Where |
|---|---|
| Name, legal details, terms version and link, defaults (commission %, period, £200 fee) | `src/lib/brand.ts` |
| Colours and fonts | `src/app/globals.css` (and `colors` in `brand.ts` for emails) |
| Consignment Form wording and layout | `buildAgreementHtml` in `src/lib/agreement.ts` |
| Purchase Agreement wording | `src/lib/purchase.ts` |
| Purchase Confirmation wording | `src/lib/confirmation.ts` |
| Shared page style, header, signatures | `src/lib/document.ts` |
| Commission wording for each option | `commissionWording` in `src/lib/agreement.ts` |
| Email wording | `src/lib/email.ts` |

When the terms change, update `terms.version` in `brand.ts`. Agreements already signed keep the version they were signed under.

## Setting it up

### 1. DocuSeal

- **API key:** DocuSeal console → API. Use the test (sandbox) key while testing.
- **Region:** if your account is on the EU cloud (docuseal.eu), set `DOCUSEAL_API_URL=https://api.docuseal.eu` and `DOCUSEAL_APP_URL=https://docuseal.eu`.
- **Webhook:** DocuSeal → Settings → Webhooks → add:
  - URL: `https://<your app address>/api/webhooks/docuseal`
  - Events: `form.completed` and `submission.completed`
  - Secret: header name `X-Webhook-Secret`, value = your `DOCUSEAL_WEBHOOK_SECRET`
- **Plan:** creating agreements from HTML and embedding the signing box are Pro features for live use. They are free in test mode.

### 2. Emails (Resend)

- Create an account at resend.com and add the domain you send from (for example `tommyzhao.watch`). Resend gives you a few DNS records to add where the domain is managed.
- Create an API key and set `RESEND_API_KEY`.
- Set `EMAIL_FROM` (for example `Tommy Zhao · No. 67 <tommy@tommyzhao.watch>`) and `EMAIL_REPLY_TO`.

If email is not set up yet, agreements are still created. The agreement page then shows a **Copy signing link** button so you can send the link yourself.

### 3. Hosting (Vercel)

1. Put this code in a private GitHub repository.
2. In Vercel: Add New → Project → import the repository. Framework: Next.js (detected automatically).
3. Add every setting from `.env.example` under Settings → Environment Variables.
4. Deploy. Then add a domain such as `sign.tommyzhao.watch` (Settings → Domains) and add the CNAME record Vercel shows.
5. Set `APP_URL` to that address and redeploy.

Vercel's free Hobby plan is for non-commercial use, so a business should use the Pro plan. Netlify or another Node host also works.

### 4. Try it

Sign in at `/admin`, create an agreement with your own email address as the consignor, sign it, countersign it, and check that both completed emails arrive with the PDF attached.

## Development

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000/admin
npm test                     # form and wording tests
npm run typecheck
```

`tests/mock-docuseal.mjs` is a stand-in for DocuSeal and Resend, and `tests/e2e.py` runs the whole flow in a browser against it (Python Playwright).
