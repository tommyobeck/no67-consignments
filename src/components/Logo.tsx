import { brand } from "@/lib/brand.ts";

export function Logo({ subline = brand.subline, href }: { subline?: string; href?: string }) {
  const inner = (
    <>
      {brand.name} <em>{subline}</em>
    </>
  );
  return href ? (
    <a className="logo" href={href}>
      {inner}
    </a>
  ) : (
    <span className="logo">{inner}</span>
  );
}

export function SiteFooter() {
  const L = brand.legal;
  return (
    <footer className="site-footer">
      {L.tradingAs} is a trading name of {L.entity}, registered in England and Wales, company number {L.companyNumber}.
      <br />
      Registered office: {L.registeredOffice}
    </footer>
  );
}
