import { type ReactNode, useId } from 'react';

import { useElementWidth } from '@/hooks/use-element-width';
import { cn } from '@/lib/utils';

import { donutSegments, labelIndexes, scaleLinear, toLinePath } from './geometry';

/** Categorical colors for chart series (index.css `--chart-N`); CSS vars follow the theme. */
export const SERIES_COLORS = [1, 2, 3, 4, 5].map((n) => `var(--chart-${n})`);

/** Answer outcome colors, matching the `bg-success` / `bg-destructive` / muted bars. */
export const OUTCOME_COLORS = {
  correct: 'var(--success)',
  wrong: 'var(--destructive)',
  unanswered: 'var(--muted-foreground)',
} as const;

export type LegendItem = {
  key: string;
  label: string;
  color: string;
  /** Shown at the end of the row, e.g. "7 · 58%". */
  value?: string;
};

/** Color dot + label per series. Labels use the text color: color alone never identifies a series. */
export function ChartLegend({ items, className }: { items: readonly LegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex flex-col gap-2', className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2 text-sm">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.value === undefined ? null : (
            <span className="text-muted-foreground">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export type LineSeries = {
  key: string;
  color: string;
  /** One value per x position (index 0 = first). */
  values: readonly number[];
};

type LineChartProps = {
  series: readonly LineSeries[];
  height?: number;
  /** Top of the y axis; the axis starts at 0. */
  yMax?: number;
  formatY?: (value: number) => string;
  formatX?: (index: number) => string;
  /** Fills under the first series with its color fading out (single-series charts). */
  area?: boolean;
  /** What the chart says, for screen readers. */
  label: string;
};

const PAD = { top: 16, right: 20, bottom: 22, left: 36 };
const Y_TICKS = [0, 0.5, 1];

/** Line chart over 0…yMax with recessive gridlines and the last value of each series labelled. */
export function LineChart({
  series,
  height = 200,
  yMax = 100,
  formatY = (value) => `${value}%`,
  formatX = (index) => String(index + 1),
  area = false,
  label,
}: LineChartProps) {
  const areaId = `area${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const count = Math.max(0, ...series.map((s) => s.values.length));
  const x = scaleLinear([0, Math.max(count - 1, 0)], [PAD.left, width - PAD.right]);
  const y = scaleLinear([0, yMax], [height - PAD.bottom, PAD.top]);

  return (
    <div ref={ref} role="img" aria-label={label} style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} className="text-[11px]">
          {area && series[0] ? (
            <defs>
              <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={series[0].color} stopOpacity={0.28} />
                <stop offset="1" stopColor={series[0].color} stopOpacity={0} />
              </linearGradient>
            </defs>
          ) : null}
          {Y_TICKS.map((tick) => {
            const value = Math.round(tick * yMax);
            return (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(value)}
                  y2={y(value)}
                  stroke="var(--border)"
                />
                <text
                  x={PAD.left - 8}
                  y={y(value) + 4}
                  fill="var(--muted-foreground)"
                  textAnchor="end"
                >
                  {formatY(value)}
                </text>
              </g>
            );
          })}
          {labelIndexes(count).map((index) => (
            <text
              key={index}
              x={x(index)}
              y={height - 4}
              fill="var(--muted-foreground)"
              textAnchor="middle"
            >
              {formatX(index)}
            </text>
          ))}
          {series.map((s, seriesIndex) => {
            const points = s.values.map((value, index) => ({ x: x(index), y: y(value) }));
            const last = points[points.length - 1];
            const first = points[0];
            const baseline = y(0);
            return (
              <g key={s.key}>
                {area && seriesIndex === 0 && first && last && points.length > 1 ? (
                  <path
                    d={`${toLinePath(points)} L${last.x} ${baseline} L${first.x} ${baseline} Z`}
                    fill={`url(#${areaId})`}
                  />
                ) : null}
                {points.length > 1 ? (
                  <path
                    d={toLinePath(points)}
                    stroke={s.color}
                    strokeWidth={area ? 3 : 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    fill="none"
                  />
                ) : null}
                {points.map((point, index) => (
                  <circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r={4}
                    fill={s.color}
                    stroke="var(--card)"
                    strokeWidth={1.5}
                  />
                ))}
                {last ? (
                  <text
                    x={last.x}
                    y={last.y - 9}
                    fontWeight={600}
                    fill="var(--muted-foreground)"
                    textAnchor="middle"
                  >
                    {formatY(s.values[s.values.length - 1] ?? 0)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}

export type PieSlice = { key: string; value: number; color: string };

type PieChartProps = {
  slices: readonly PieSlice[];
  size?: number;
  thickness?: number;
  /** Shown in the hole, e.g. the main percentage. */
  children?: ReactNode;
  label: string;
};

/** Donut chart: one stroked circle per slice, starting at the top and going clockwise. */
export function PieChart({ slices, size = 160, thickness = 18, children, label }: PieChartProps) {
  const center = size / 2;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const segments = donutSegments(
    slices.map((slice) => slice.value),
    circumference,
    Math.min(3, thickness / 4),
  );
  const isEmpty = segments.every((segment) => segment === null);

  return (
    <div
      role="img"
      aria-label={label}
      className="relative flex shrink-0 flex-col items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0">
        {isEmpty ? (
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="var(--secondary)"
            strokeWidth={thickness}
            fill="none"
          />
        ) : null}
        <g transform={`rotate(-90 ${center} ${center})`}>
          {slices.map((slice, index) => {
            const segment = segments[index];
            if (!segment) return null;
            return (
              <circle
                key={slice.key}
                cx={center}
                cy={center}
                r={radius}
                stroke={slice.color}
                strokeWidth={thickness}
                strokeDasharray={`${segment.length} ${circumference - segment.length}`}
                // A negative offset moves the dash forward along the circle.
                strokeDashoffset={-segment.start}
                fill="none"
              />
            );
          })}
        </g>
      </svg>
      <div className="relative flex flex-col items-center">{children}</div>
    </div>
  );
}

export type BarSegment = {
  key: string;
  value: number;
  /** Background class, e.g. `bg-success`. */
  className: string;
};

/** Horizontal bar split in proportion to the segment values. */
export function StackedBar({
  segments,
  className,
}: {
  segments: readonly BarSegment[];
  className?: string;
}) {
  return (
    <div className={cn('flex h-2 gap-0.5 overflow-hidden rounded-full bg-secondary', className)}>
      {segments.map((segment) =>
        segment.value > 0 ? (
          <div key={segment.key} className={segment.className} style={{ flex: segment.value }} />
        ) : null,
      )}
    </div>
  );
}
