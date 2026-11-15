import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth.ts";
import { Logo } from "@/components/Logo.tsx";
import { AdminNav } from "./AdminNav.tsx";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <header className="admin-header">
        <Logo subline="documents" href="/admin" />
        <Suspense fallback={null}>
          <AdminNav />
        </Suspense>
      </header>
      <main className="admin-main">{children}</main>
    </>
  );
}
