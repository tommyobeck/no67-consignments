"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions.ts";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action}>
      <label className={`field${state.error ? " has-error" : ""}`}>
        Password
        <input type="password" name="password" autoComplete="current-password" required autoFocus />
        {state.error && <span className="err">{state.error}</span>}
      </label>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
