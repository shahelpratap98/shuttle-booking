import type { ReactNode } from "react";

// label · value · change vs the previous period. `goodWhenUp` decides the
// colour of the change; the arrow and words carry it too, not colour alone.
export function StatTile({
  label,
  value,
  delta,
  goodWhenUp = true,
  note,
}: {
  label: string;
  value: string;
  delta?: number | null;
  goodWhenUp?: boolean;
  note?: ReactNode;
}) {
  let deltaEl: ReactNode = null;
  if (delta !== undefined) {
    if (delta === null || !Number.isFinite(delta)) {
      deltaEl = <span className="text-muted">no earlier data</span>;
    } else {
      const flat = Math.abs(delta) < 0.005;
      const up = delta > 0;
      const good = flat ? null : up === goodWhenUp;
      deltaEl = (
        <span className={good === null ? "text-muted" : good ? "text-ok" : "text-bad"}>
          <span aria-hidden="true">{flat ? "→" : up ? "↑" : "↓"}</span> {flat ? "no change" : `${Math.round(Math.abs(delta) * 100)}% ${up ? "up" : "down"}`}
        </span>
      );
    }
  }
  return (
    <div className="card flex min-w-0 flex-col gap-1 p-4">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="text-2xl font-semibold tracking-tight tabular">{value}</p>
      {deltaEl || note ? (
        <p className="text-xs font-semibold">
          {deltaEl}
          {deltaEl && note ? <span className="font-normal text-muted"> · </span> : null}
          {note ? <span className="font-normal text-muted">{note}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
