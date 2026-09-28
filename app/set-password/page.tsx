"use client";

import { setPassword } from "@/app/auth-actions";
import { AuthCard, FormMessage } from "@/components/auth-card";
import { Spinner } from "@/components/spinner";
import { useFormAction } from "@/components/use-form-action";

// Reached from an invite or reset link (via /auth/confirm), already signed in.
export default function SetPasswordPage() {
  const { state, pending, onSubmit } = useFormAction(setPassword);
  return (
    <AuthCard title="Choose your password" intro="At least 10 characters. A short sentence is easy to remember and hard to guess.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="password" className="field-label">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="field" />
        </div>
        <div>
          <label htmlFor="confirm" className="field-label">Type it again</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required className="field" />
        </div>
        {state?.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? <><Spinner /> Saving…</> : "Save password"}
        </button>
      </form>
    </AuthCard>
  );
}
