"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { logout } from "../login/actions.ts";

export function AdminNav() {
  const path = usePathname();
  const view = useSearchParams().get("view");
  const current = (match: boolean) => (match ? ("page" as const) : undefined);
  return (
    <nav className="admin-nav" aria-label="Sections">
      <Link href="/admin/new" aria-current={current(path === "/admin/new")}>
        New agreement
      </Link>
      <Link href="/admin" aria-current={current(path === "/admin" && view !== "signed")}>
        Awaiting signature
      </Link>
      <Link href="/admin?view=signed" aria-current={current(path === "/admin" && view === "signed")}>
        Signed
      </Link>
      <form action={logout}>
        <button type="submit" className="btn link" style={{ minHeight: 0, padding: 0, fontSize: 13 }}>
          Sign out
        </button>
      </form>
    </nav>
  );
}
