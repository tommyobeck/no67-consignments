import type { DetailedHTMLProps, HTMLAttributes } from "react";

type DocusealFormAttributes = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  "data-src": string;
  "data-email"?: string;
  "data-completed-redirect-url"?: string;
  "data-with-title"?: string;
  "data-with-download-button"?: string;
  "data-with-send-copy-button"?: string;
  "data-background-color"?: string;
  "data-language"?: string;
  "data-custom-css"?: string;
  "data-allow-typed-signature"?: string;
};

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "docuseal-form": DocusealFormAttributes;
    }
  }
}
