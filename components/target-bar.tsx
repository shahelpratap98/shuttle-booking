// How far a week's bookings got towards the weekly target: a short bar and
// the percentage. Green once the target is reached.
export function TargetBar({ value, target }: { value: number; target: number }) {
  const share = target > 0 ? value / target : 0;
  const met = share >= 1;
  return (
    <span className="inline-flex items-center justify-end gap-2" title={`${Math.round(share * 100)}% of the weekly target`}>
      <span aria-hidden="true" className="relative h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
        <span className={`absolute inset-y-0 left-0 rounded-full ${met ? "bg-ok" : "bg-series-1"}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
      </span>
      <span className={`w-10 text-right ${met ? "font-semibold text-ok" : ""}`}>{Math.round(share * 100)}%</span>
    </span>
  );
}
