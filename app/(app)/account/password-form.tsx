"use client";

import { setPassword } from "@/app/auth-actions";
import { FormMessage } from "@/components/auth-card";
import { Spinner } from "@/components/spinner";
import { useFormAction } from "@/components/use-form-action";

export function PasswordForm() {
  const { state, pending, onSubmit } = useFormAction(setPassword);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="password" className="field-label">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="field" />
      </div>
      <div>
        <label htmlFor="confirm" className="field-label">Type it again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required className="field" />
      </div>
      {state?.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {pending ? <><Spinner /> Saving…</> : "Change password"}
      </button>
    </form>
  );
}
