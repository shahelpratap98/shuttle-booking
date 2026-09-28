"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Small hand-built charts. Specs follow the dataviz method: thin marks with
// 4px rounded data-ends, 2px surface gaps between stacked segments, hairline
// grid, one axis, legend for 2+ series, text in text colours (never the series
// colour), and a hover/focus tooltip on every mark.

export type Series = { name: string; colour: string };

// Named formats, because server components can't hand functions to this file.
export type ValueFormat = "count" | "compact";
const whole = new Intl.NumberFormat("en-NZ", { maximumFractionDigits: 0 });
function formatter(f: ValueFormat = "count"): (n: number) => string {
  if (f === "compact") return (n) => (Math.abs(n) >= 10_000 ? `${whole.format(n / 1000)}k` : whole.format(n));
  return (n) => whole.format(n);
}

function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// Round an axis maximum up to a clean number and give 4 evenly spaced ticks.
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: 5 }, (_, i) => i * step);
}

// Column path with a 4px rounded top and a square base.
function columnPath(x: number, y: number, w: number, h: number, round: boolean) {
  if (h <= 0) return "";
  const r = round ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function Legend({ series, kind = "rect" }: { series: Series[]; kind?: "rect" | "line" }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {series.map((s) => (
        <li key={s.name} className="inline-flex items-center gap-1.5">
          {kind === "rect" ? (
            <span aria-hidden="true" className="inline-block size-2.5 rounded-[3px]" style={{ background: s.colour }} />
          ) : (
            <span aria-hidden="true" className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: s.colour }} />
          )}
          {s.name}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  // keep it inside the chart horizontally
  const left = Math.min(Math.max(x, 80), width - 80);
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
      style={{ left, top: y - 8 }}
    >
      {children}
    </div>
  );
}

function TipRow({ colour, label, value }: { colour: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: colour }} />
      <span className="font-semibold text-text tabular">{value}</span>
      <span className="text-muted">{label}</span>
    </div>
  );
}

const PAD = { top: 12, right: 12, bottom: 28, left: 44 };

// ------------------------------------------------------------------ stacked columns

export function StackedColumns({
  labels,
  series,
  values,
  format: fmt,
  height = 220,
  ariaLabel,
}: {
  labels: string[];
  series: Series[];
  values: number[][]; // values[column][series]
  format?: ValueFormat;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const format = formatter(fmt);
  const totals = values.map((v) => v.reduce((a, b) => a + b, 0));
  const ticks = niceTicks(Math.max(...totals, 1));
  const top = ticks[ticks.length - 1];
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const band = plotW / labels.length;
  const colW = Math.min(24, band * 0.6);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const labelEvery = Math.ceil(labels.length / Math.max(1, Math.floor(plotW / 56)));

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-grid)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular">{format(t)}</text>
          </g>
        ))}
        {values.map((col, i) => {
          const x = PAD.left + band * i + (band - colW) / 2;
          let acc = 0;
          const lastNonZero = col.reduce((last, v, s) => (v > 0 ? s : last), -1);
          return (
            <g
              key={i}
              tabIndex={0}
              aria-label={`${labels[i]}: ${series.map((s, k) => `${s.name} ${format(col[k])}`).join(", ")}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="outline-none"
            >
              {/* hit area: the whole band, not just the painted pixels */}
              <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="transparent" />
              {col.map((v, s) => {
                if (v <= 0) return null;
                const below = acc;
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                // 2px surface gap between a segment and the one beneath it
                const h = Math.max(0, y0 - y1 - (below > 0 ? 2 : 0));
                return (
                  <path
                    key={s}
                    d={columnPath(x, y1, colW, h, s === lastNonZero)}
                    fill={series[s].colour}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                );
              })}
            </g>
          );
        })}
        <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--color-line-2)" strokeWidth={1} />
        {labels.map((l, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={PAD.left + band * i + band / 2} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">{l}</text>
          ) : null,
        )}
      </svg>
      {hover !== null ? (
        <Tooltip x={PAD.left + band * hover + band / 2} y={y(totals[hover])} width={width}>
          <p className="mb-1 font-semibold text-text">{labels[hover]} · {format(totals[hover])} total</p>
          {series.map((s, k) => <TipRow key={s.name} colour={s.colour} label={s.name} value={format(values[hover][k])} />)}
        </Tooltip>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ lines

export function LineChart({
  labels,
  series,
  values,
  format: fmt,
  height = 220,
  ariaLabel,
}: {
  labels: string[];
  series: Series[];
  values: number[][]; // values[series][point]
  format?: ValueFormat;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const format = formatter(fmt);
  const all = values.flat();
  const min = Math.min(0, ...all);
  const ticks = niceTicks(Math.max(...all, 1) - min).map((t) => t + (min < 0 ? Math.floor(min) : 0));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const right = 64; // room for end labels
  const plotW = width - PAD.left - right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (labels.length === 1 ? plotW / 2 : (plotW * i) / (labels.length - 1));
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const labelEvery = Math.ceil(labels.length / Math.max(1, Math.floor(plotW / 56)));

  // End labels only where they don't collide; the legend and tooltip carry the rest.
  const ends = series.map((_, s) => y(values[s][values[s].length - 1]));
  const showEnd = ends.map((e, s) => ends.every((o, k) => k === s || Math.abs(o - e) >= 14));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const i = labels.length === 1 ? 0 : Math.round((px / box.width) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  };

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className="block outline-none"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((h) => Math.min(labels.length - 1, (h ?? -1) + 1));
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? labels.length) - 1));
        }}
        onBlur={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-line-2)" : "var(--color-grid)"} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular">{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">{l}</text>
          ) : null,
        )}
        {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-line-2)" strokeWidth={1} /> : null}
        {series.map((s, k) => (
          <g key={s.name}>
            <polyline
              points={values[k].map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={s.colour}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* end dot with a 2px surface ring */}
            <circle cx={x(labels.length - 1)} cy={ends[k]} r={4} fill={s.colour} stroke="var(--color-surface)" strokeWidth={2} />
            {showEnd[k] ? (
              <text x={x(labels.length - 1) + 8} y={ends[k]} dy="0.32em" className="fill-text text-[11px] font-semibold tabular">
                {format(values[k][values[k].length - 1])}
              </text>
            ) : null}
            {hover !== null ? <circle cx={x(hover)} cy={y(values[k][hover])} r={4} fill={s.colour} stroke="var(--color-surface)" strokeWidth={2} /> : null}
          </g>
        ))}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null ? (
        <Tooltip x={x(hover)} y={PAD.top + 8} width={width}>
          <p className="mb-1 font-semibold text-text">{labels[hover]}</p>
          {series.map((s, k) => <TipRow key={s.name} colour={s.colour} label={s.name} value={format(values[k][hover])} />)}
        </Tooltip>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ horizontal bars

export function BarList({
  rows,
  colour = "var(--color-series-1)",
}: {
  rows: { label: ReactNode; value: number; display: string; sub?: string }[];
  colour?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm sm:grid-cols-[minmax(0,11rem)_1fr]">
          <span className="truncate text-muted">{r.label}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-3 rounded-r-[4px]"
              style={{ width: `${Math.max(2, (r.value / max) * 78)}%`, background: colour }}
              aria-hidden="true"
            />
            <span className="shrink-0 font-semibold tabular">{r.display}</span>
            {r.sub ? <span className="hidden shrink-0 text-xs text-muted lg:inline">{r.sub}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ heatmap

// Sequential blue ramp (dataviz reference steps 100-700).
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

export function Heatmap({ rows, grid, hours }: { rows: string[]; grid: number[][]; hours: number[] }) {
  const max = Math.max(...grid.flat(), 1);
  const [hover, setHover] = useState<string | null>(null);
  const hourLabel = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[2px] text-[11px]">
        <thead>
          <tr>
            <th />
            {hours.map((h) => (
              <th key={h} scope="col" className="px-0.5 font-normal text-muted">{h % 2 === 0 ? hourLabel(h) : ""}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r}>
              <th scope="row" className="pr-2 text-left font-normal text-muted">{r}</th>
              {hours.map((h) => {
                const v = grid[ri][h];
                const step = v === 0 ? -1 : Math.min(RAMP.length - 1, Math.floor((v / max) * (RAMP.length - 0.01)));
                const id = `${ri}-${h}`;
                return (
                  <td
                    key={h}
                    tabIndex={0}
                    aria-label={`${r} ${hourLabel(h)}: ${v} pickups`}
                    onPointerEnter={() => setHover(id)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover(id)}
                    onBlur={() => setHover(null)}
                    className="relative size-5 min-w-5 rounded-[3px] outline-offset-1"
                    style={{ background: step < 0 ? "var(--color-surface-2)" : RAMP[step], outline: hover === id ? "2px solid var(--color-text)" : undefined }}
                  >
                    {hover === id ? (
                      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-md border border-line bg-surface px-2 py-1 whitespace-nowrap shadow-lg">
                        <b className="tabular">{v}</b> <span className="text-muted">pickups · {r} {hourLabel(h)}</span>
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        Fewer
        {RAMP.map((c) => <span key={c} aria-hidden="true" className="inline-block size-3 rounded-[2px]" style={{ background: c }} />)}
        More
      </p>
    </div>
  );
}
