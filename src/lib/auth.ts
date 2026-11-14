import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env.ts";

const COOKIE = "no67_admin";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // stay signed in for two weeks

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function passwordMatches(candidate: string): boolean {
  return safeEqual(candidate, env.adminPassword());
}

export async function startSession(): Promise<void> {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = `admin.${expires}`;
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function isSignedIn(): Promise<boolean> {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  if (!value) return false;
  const lastDot = value.lastIndexOf(".");
  if (lastDot < 0) return false;
  const payload = value.slice(0, lastDot);
  const sig = value.slice(lastDot + 1);
  if (!safeEqual(sig, sign(payload))) return false;
  const [who, exp] = payload.split(".");
  return who === "admin" && Number(exp) > Date.now() / 1000;
}

/** Call at the top of every private page and server action. */
export async function requireAdmin(): Promise<void> {
  if (!(await isSignedIn())) redirect("/admin/login");
}
