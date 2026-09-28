"use client";

import type { ReactNode } from "react";
import { Spinner } from "@/components/spinner";
import { useFormAction } from "@/components/use-form-action";

export type ActionState = { ok: boolean; message: string; link?: string } | undefined;
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

// A <form> wired to a server action, with its result shown underneath.
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  className = "",
  submitClass = "btn btn-primary",
  resetOnSuccess = false,
}: {
  action: FormAction;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  submitClass?: string;
  resetOnSuccess?: boolean; // clear the fields after it works ("add another")
}) {
  const { state, pending, onSubmit, formRef } = useFormAction(action, { resetOnSuccess });

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className}>
      {children}
      <div className="flex flex-col gap-2">
        <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
          {pending ? <><Spinner /> {pendingLabel}</> : submitLabel}
        </button>
        <Outcome state={state} />
      </div>
    </form>
  );
}

export function Outcome({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <div className="flex flex-col gap-2">
      <p role={state.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm font-semibold ${state.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}>
        {state.message}
      </p>
      {state.link ? (
        <input readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} className="field font-mono text-xs" aria-label="Sign-in link" />
      ) : null}
    </div>
  );
}
