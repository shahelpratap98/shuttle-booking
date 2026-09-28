"use client";

import { startTransition, useActionState, useRef, type FormEvent } from "react";

// Like useActionState on <form action>, but without React's automatic form
// reset: when the server says "that email doesn't look right", everything
// the person typed stays put. Pass resetOnSuccess for "add another" forms.
export function useFormAction<S>(
  action: (prev: S, fd: FormData) => Promise<S>,
  opts: { resetOnSuccess?: boolean } = {},
) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState<S, FormData>(async (prev, fd) => {
    const next = await action(prev as S, fd);
    if (opts.resetOnSuccess && (next as { ok?: unknown } | undefined)?.ok === true) formRef.current?.reset();
    return next;
  }, undefined as Awaited<S>);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Include the clicked button's name/value (e.g. status=completed).
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => run(fd));
  };

  return { state, pending, onSubmit, formRef };
}
