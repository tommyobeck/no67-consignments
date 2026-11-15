import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth.ts";
import { Logo } from "@/components/Logo.tsx";
import { LoginForm } from "./LoginForm.tsx";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await isSignedIn()) redirect("/admin");
  return (
    <main className="login">
      <Logo subline="documents" />
      <LoginForm />
    </main>
  );
}
