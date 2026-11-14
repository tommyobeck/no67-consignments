"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Styles for DocuSeal's signing box, so it sits quietly inside the page.
const CUSTOM_CSS = `
  #submit_form_button, .submit-form-button { background-color: #1A1A18 !important; color: #F6F3EC !important; border-radius: 0 !important; letter-spacing: 0.04em; }
  .base-button, .white-button { border-radius: 0 !important; }
  #form_container { border-radius: 0 !important; }
`;

export function SigningBox({ src, email, doneUrl, host }: { src: string; email?: string; doneUrl: string; host?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-docuseal="form"]');
    if (!existing) {
      const s = document.createElement("script");
      s.src = "https://cdn.docuseal.com/js/form.js";
      s.async = true;
      s.dataset.docuseal = "form";
      s.onerror = () => setFailed(true);
      document.body.appendChild(s);
    }
    const el = ref.current;
    if (!el) return;
    const onDone = () => router.push(doneUrl);
    el.addEventListener("completed", onDone);
    return () => el.removeEventListener("completed", onDone);
  }, [doneUrl, router]);

  if (failed) {
    return (
      <div className="notice error">
        The signing box could not load. Please refresh the page, or open the link on another device. If it keeps happening, reply to the email you received.
      </div>
    );
  }

  return (
    <docuseal-form
      ref={ref}
      data-src={src}
      data-host={host}
      data-email={email}
      data-completed-redirect-url={doneUrl}
      data-with-title="false"
      data-with-send-copy-button="false"
      data-background-color="#FFFFFF"
      data-language="en"
      data-custom-css={CUSTOM_CSS}
    />
  );
}
