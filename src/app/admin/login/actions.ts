"use server";

import { redirect } from "next/navigation";
import { passwordMatches, startSession, endSession } from "@/lib/auth.ts";

export type LoginState = { error?: string };

// Simple slowdown against password guessing.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  await wait(600);
  if (!password || !passwordMatches(password)) return { error: "That password is not right." };
  await startSession();
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/admin/login");
}
