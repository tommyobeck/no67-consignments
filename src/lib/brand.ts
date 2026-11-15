/**
 * Everything that changes when the business rebrands lives here.
 * Swap these values (and the colours in globals.css) for the full launch.
 */
export const brand = {
  name: "No. 67",
  subline: "by Tommy Zhao",
  fullName: "No. 67 by Tommy Zhao",
  website: "https://tommyzhao.watch",
  contactEmail: "info@tommyzhao.watch",
  legal: {
    entity: "Obeck Limited",
    companyNumber: "16901069",
    registeredOffice: "67 Farringdon Road, London EC1M 3JB",
    tradingAs: "No. 67 by Tommy Zhao",
  },
  terms: {
    title: "Consignment Terms and Conditions",
    version: "31 October 2026",
    shortVersion: "31 Oct 2026",
    url: "https://tommyzhao.watch/pages/consignment-terms-conditions-no-67-by-tommy-zhao",
  },
  defaults: {
    commissionPercent: 10,
    periodDays: 60,
    minPeriodDays: 30,
    earlyReturnFee: 200,
  },
  colors: {
    ground: "#F6F3EC",
    stone: "#EFEBE3",
    sage: "#DCE0CF",
    cream: "#D6CFC2",
    ink: "#1A1A18",
    muted: "#5F5B53",
    line: "#E2DDD3",
  },
} as const;

/** Role names used inside DocuSeal. Changing these breaks agreements already sent. */
export const ROLES = {
  consignor: "Consignor",
  seller: "Seller",
  company: "Company",
} as const;

/** The three kinds of document the app sends. */
export const DOC_TYPES = {
  consignment: {
    label: "consignment agreement",
    title: "Consignment Form",
    heading: "Consignment agreement",
    namePrefix: "Consignment",
    refPrefix: "C",
    partyRole: ROLES.consignor,
    partyNoun: "Consignor",
  },
  purchase: {
    label: "purchase agreement",
    title: "Purchase Agreement",
    heading: "Purchase agreement",
    namePrefix: "Purchase Agreement",
    refPrefix: "P",
    partyRole: ROLES.seller,
    partyNoun: "Seller",
  },
  confirmation: {
    label: "purchase confirmation",
    title: "Purchase Confirmation",
    heading: "Purchase confirmation",
    namePrefix: "Purchase Confirmation",
    refPrefix: "PC",
    partyRole: ROLES.consignor,
    partyNoun: "Consignor",
  },
} as const;

export type DocType = keyof typeof DOC_TYPES;
export const DOC_TYPE_KEYS = Object.keys(DOC_TYPES) as DocType[];

export function isDocType(v: unknown): v is DocType {
  return typeof v === "string" && v in DOC_TYPES;
}

/** Every document name starts with one of these, so the app can ignore other DocuSeal documents. */
export function isOurSubmissionName(name: string | null | undefined): boolean {
  return DOC_TYPE_KEYS.some((k) => (name ?? "").startsWith(DOC_TYPES[k].namePrefix));
}

/** Kept for agreements created before purchase documents existed. */
export const SUBMISSION_PREFIX = "Consignment";
