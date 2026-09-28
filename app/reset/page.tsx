"use client";

import Link from "next/link";
import { requestReset } from "@/app/auth-actions";
import { AuthCard, FormMessage } from "@/components/auth-card";
import { Spinner } from "@/components/spinner";
import { useFormAction } from "@/components/use-form-action";

export default function ResetPage() {
  const { state, pending, onSubmit } = useFormAction(requestReset);
  return (
    <AuthCard title="Reset your password" intro="We'll email you a link to choose a new one.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="field-label">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required className="field" />
        </div>
        {state?.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
        {state?.ok ? <FormMessage tone="ok">{state.ok}</FormMessage> : null}
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? <><Spinner /> Sending…</> : "Send reset link"}
        </button>
      </form>
      <p className="mt-5 text-sm"><Link href="/login" className="link">Back to sign in</Link></p>
    </AuthCard>
  );
}
