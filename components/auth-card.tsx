import type { ReactNode } from "react";

// Shared frame for the signed-out screens (sign in, reset, set password).
export function AuthCard({ title, intro, children, footer }: { title: string; intro?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="flex items-center gap-2.5 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={36} height={36} className="size-9" />
          <span className="text-lg font-bold tracking-tight">Shuttle bookings</span>
        </div>
        <div className="mt-4 rounded-2xl bg-surface p-7 shadow-xl sm:p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          {intro ? <p className="mt-2 text-[15px] text-muted">{intro}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-5 text-center text-sm text-white/70">{footer}</div> : null}
      </div>
    </main>
  );
}

export function FormMessage({ tone, children }: { tone: "error" | "ok"; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${tone === "error" ? "bg-bad-bg text-bad" : "bg-ok-bg text-ok"}`}>
      {children}
    </p>
  );
}
