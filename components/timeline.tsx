"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleDot, GitCommit, GitPullRequest } from "lucide-react";
// ponytail: static lucide glyphs, not the animated Animate UI wrappers — the
// wrappers are ~100 lines of variants each and the popover icon is 14px; add
// the animated variants if the pixel-icon language ever needs them.
import {
  axisLabels,
  bucketize,
  clampRange,
  countInRange,
  initialBounds,
  panRange,
  zoomRange,
  type Kind,
  type Range,
  type TimelineEvent,
} from "@/lib/timeline";

// Lanes stacked top-down; the commit lane is the spine, so it is the tallest.
const LANE_GAP = 6;
let laneCursor = 0;
const LANES = [
  { kind: "issue", height: 26 },
  { kind: "pr", height: 34 },
  { kind: "commit", height: 52 },
].map((lane) => {
  const top = laneCursor;
  laneCursor += lane.height + LANE_GAP;
  return { ...lane, top } as { kind: Kind; height: number; top: number };
});
const LANE_BY_KIND = new Map(LANES.map((l) => [l.kind, l]));
const laneOf = (kind: Kind) => LANE_BY_KIND.get(kind)!;
const STRIP_H = laneOf("commit").top + laneOf("commit").height;
const AXIS_H = 26;
const SVG_H = STRIP_H + AXIS_H;

const COLORS: Record<Kind, string> = {
  commit: "var(--primary)",
  pr: "var(--accent)",
  issue: "var(--chart-3)",
};
const LANE_LABELS: Record<Kind, string> = { commit: "COMMITS", pr: "PRS", issue: "ISSUES" };
const KIND_ICONS = {
  commit: GitCommit,
  pr: GitPullRequest,
  issue: CircleDot,
} as const;

// Above this visible span — or with this many events in view — bars aggregate
// instead of rendering a wall of individual ticks.
const DENSITY_SPAN = 45 * 86400_000;
const MAX_TICKS = 3000;
const MIN_SPAN = 3600_000; // 1h — floor for zooming in
const MIN_LABEL_GAP = 64;
const POPOVER_W = 280;
const SCALE_NAMES: [number, string][] = [
  [3650, "DECADE"],
  [365, "YEAR"],
  [28, "MONTH"],
  [7, "WEEK"],
  [1, "DAY"],
  [0, "HOUR"],
];

function scaleName(spanMs: number): string {
  const days = spanMs / 86400_000;
  return SCALE_NAMES.find(([d]) => days >= d)?.[1] ?? "HOUR";
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function bucketLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase();
}

interface PopoverData {
  x: number;
  title: string;
  subtitle: string;
  url: string | null;
  kind: Kind;
  counts?: string;
}

export function Timeline({ events, now }: { events: TimelineEvent[]; now: number }) {
  const [bounds, setBounds] = useState<Range>(() => initialBounds(events, now));
  const [range, setRange] = useState<Range>(bounds);
  const [prevEvents, setPrevEvents] = useState(events);
  const [width, setWidth] = useState(900);
  const [hovered, setHovered] = useState<PopoverData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Mirror state into refs so the once-bound wheel listener reads live values.
  const rangeRef = useRef(range);
  const boundsRef = useRef(bounds);
  const widthRef = useRef(width);
  useEffect(() => {
    rangeRef.current = range;
    boundsRef.current = bounds;
    widthRef.current = width;
  });

  // New chunks land while the crawl runs: grow the window from the past end
  // so the fill is visible — adjusting state during render, per the React
  // sanctioned pattern for state that derives from props. Only the "fit" view
  // follows the fill: at fit, `range` always equals `bounds`, so zoomed/paned
  // views (range !== bounds) keep their viewport while new data lands.
  if (events !== prevEvents) {
    setPrevEvents(events);
    const next = initialBounds(events, now);
    setBounds((b) => (b.start === next.start && b.end === next.end ? b : next));
    const atFit = range.start === bounds.start && range.end === bounds.end;
    if (atFit) setRange((r) => (r.start === next.start && r.end === next.end ? r : next));
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    // Bound once (reading live state via refs) — re-binding on every range
    // change let wheel events slip past preventDefault and scroll the page,
    // dragging the timeline out from under the cursor mid-zoom.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = rangeRef.current;
      const b = boundsRef.current;
      const span = r.end - r.start;
      const rect = el.getBoundingClientRect();
      const pxPerMs = rect.width ? rect.width / span : 1;
      const dx = (e.shiftKey ? e.deltaY : e.deltaX) * (e.deltaMode === 1 ? 16 : 1);
      if (dx !== 0) {
        setRange((cur) => panRange(cur, dx / pxPerMs, b, MIN_SPAN));
        return;
      }
      if (e.deltaY === 0) return;
      const anchor = r.start + (e.clientX - rect.left) / pxPerMs;
      const factor = e.deltaY < 0 ? 1.4 : 1 / 1.4;
      setRange((cur) => clampRange(zoomRange(cur, factor, anchor), b, MIN_SPAN));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const span = range.end - range.start;
  const dense = span > DENSITY_SPAN || countInRange(events, range) > MAX_TICKS;
  const x = (t: number) => (width * (t - range.start)) / span;

  const buckets = useMemo(
    () => (dense ? bucketize(events, range, Math.max(1, Math.round(width))) : null),
    [dense, events, range, width],
  );
  const visible = useMemo(
    () => (dense ? null : events.filter((e) => e.at >= range.start && e.at <= range.end)),
    [dense, events, range],
  );
  const axis = useMemo(() => axisLabels(range, MIN_LABEL_GAP, width), [range, width]);

  const zoomButtons = (factor: number) =>
    setRange((r) => clampRange(zoomRange(r, factor, (r.start + r.end) / 2), bounds, MIN_SPAN));

  const laneBars = (kind: Kind) => {
    if (!buckets) return [];
    const counts = buckets[kind];
    const max = Math.max(...counts, 1);
    const lane = laneOf(kind);
    return counts.flatMap((count, i) => {
      if (count === 0) return [];
      const h = Math.max(1, Math.round((count / max) * lane.height));
      return [{ x: i, y: lane.top + lane.height - h, h }];
    });
  };

  const onDensityMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!buckets) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const index = Math.min(buckets.commit.length - 1, Math.max(0, Math.floor((px / width) * buckets.commit.length)));
    const counts = [buckets.commit[index], buckets.pr[index], buckets.issue[index]];
    if (counts.every((c) => c === 0)) {
      setHovered(null);
      return;
    }
    const parts = (["commit", "pr", "issue"] as Kind[])
      .map((k, i) => (counts[i] > 0 ? `${counts[i]} ${LANE_LABELS[k]}` : ""))
      .filter(Boolean)
      .join(" · ");
    setHovered({
      x: px,
      title: parts,
      subtitle: bucketLabel(range.start + (index / buckets.commit.length) * span),
      url: null,
      kind: "commit",
    });
  };

  const popover = hovered && (
    <div
      className="absolute bottom-full mb-2 z-40 w-[280px] rounded-sm border border-border bg-card p-3 shadow-lg"
      style={{ left: Math.min(width - POPOVER_W - 8, Math.max(8, hovered.x - POPOVER_W / 2)) }}
    >
      <div className="flex items-center gap-2">
        {(() => {
          const Icon = KIND_ICONS[hovered.kind];
          return <Icon size={14} style={{ color: COLORS[hovered.kind] }} />;
        })()}
        <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">{LANE_LABELS[hovered.kind]}</span>
      </div>
      <p className="mt-1.5 font-heading text-xs leading-snug tracking-wide">{hovered.title}</p>
      <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">{hovered.subtitle}</p>
      {hovered.url && (
        <a
          href={hovered.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block font-mono text-[10px] tracking-[0.2em] text-primary hover:underline"
        >
          OPEN ON GITHUB ↗
        </a>
      )}
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          {LANES.map((lane) => (
            <span key={lane.kind} className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
              <span className="h-2 w-2" style={{ backgroundColor: COLORS[lane.kind] }} />
              {LANE_LABELS[lane.kind]}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            {scaleName(span)} · {formatDay(range.start)} — {formatDay(range.end)}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRange(bounds)}
              className="rounded-sm border border-border bg-secondary px-2.5 py-1 font-heading text-xs tracking-widest hover:bg-secondary/70"
            >
              FIT
            </button>
            <button
              type="button"
              onClick={() => zoomButtons(0.5)}
              className="rounded-sm border border-border bg-secondary px-2.5 py-1 font-heading text-xs tracking-widest hover:bg-secondary/70"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => zoomButtons(2)}
              className="rounded-sm border border-border bg-secondary px-2.5 py-1 font-heading text-xs tracking-widest hover:bg-secondary/70"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        {popover}
        <div ref={containerRef} className="overflow-hidden rounded-sm border border-border bg-card">
          <svg
            ref={svgRef}
            width={width}
            height={SVG_H}
            className="block w-full"
            onMouseLeave={() => setHovered(null)}
            onMouseMove={dense ? onDensityMove : undefined}
          >
            {axis.map((tick) => (
              <g key={tick.at}>
                <line x1={x(tick.at)} y1={0} x2={x(tick.at)} y2={STRIP_H} stroke="var(--border)" strokeWidth={1} opacity={0.6} />
                <text
                  x={x(tick.at)}
                  y={STRIP_H + 17}
                  textAnchor="middle"
                  className="fill-muted-foreground font-mono text-[10px] tracking-widest"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {dense
              ? LANES.flatMap((lane) =>
                  laneBars(lane.kind).map((b) => (
                    <rect key={`${lane.kind}${b.x}`} x={b.x} y={b.y} width={1} height={b.h} fill={COLORS[lane.kind]} />
                  )),
                )
              : visible!.map((e) => {
                  const lane = laneOf(e.kind);
                  return (
                    <g key={e.id}>
                      <rect
                        x={x(e.at)}
                        y={lane.top}
                        width={2}
                        height={lane.height}
                        fill={COLORS[e.kind]}
                        className="cursor-pointer"
                      />
                      <rect
                        x={x(e.at) - 5}
                        y={0}
                        width={12}
                        height={STRIP_H}
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() =>
                          setHovered({
                            x: x(e.at),
                            title: e.title.split("\n")[0],
                            subtitle: `${e.repo} · ${new Date(e.at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`,
                            url: e.url,
                            kind: e.kind,
                          })
                        }
                        onClick={() => window.open(e.url, "_blank", "noreferrer")}
                      />
                    </g>
                  );
                })}
          </svg>
        </div>
      </div>
    </div>
  );
}
