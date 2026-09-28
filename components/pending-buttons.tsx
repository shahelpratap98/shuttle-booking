"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLinkStatus } from "next/link";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/spinner";

// Put inside a <Link>: shows the wheel from the click until the new page arrives.
export function LinkPending({ className = "size-3.5" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? <Spinner className={className} /> : null;
}

// Submit button for a <form action={serverAction}>: shows the wheel while it runs.
export function ActionSubmit({
  children,
  pendingLabel,
  className = "btn btn-primary",
  name,
  value,
  confirm,
}: {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
  name?: string;
  value?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      onClick={confirm ? (e) => !window.confirm(confirm) && e.preventDefault() : undefined}
      className={className}
    >
      {pending ? <><Spinner /> {pendingLabel}</> : children}
    </button>
  );
}

// Submit button for a plain GET form (filters). Those load a new page, so
// listen for the form's submit event and spin until the page is replaced.
export function FilterSubmit({ children, className = "btn btn-primary" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const start = () => setBusy(true);
    const reset = () => setBusy(false);
    form.addEventListener("submit", start);
    window.addEventListener("pageshow", reset);
    return () => {
      form.removeEventListener("submit", start);
      window.removeEventListener("pageshow", reset);
    };
  }, []);

  return (
    <button ref={ref} type="submit" aria-busy={busy} className={`${className} ${busy ? "pointer-events-none opacity-80" : ""}`}>
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}
