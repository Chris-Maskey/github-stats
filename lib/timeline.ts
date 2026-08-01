import type { Commit, Issue, PR } from '../src/types.ts'

export type Kind = 'commit' | 'pr' | 'issue'

export interface TimelineEvent {
  id: string
  kind: Kind
  at: number
  title: string
  repo: string
  url: string
}

export function normalizeEvents(commits: Commit[], prs: PR[], issues: Issue[]): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const c of commits) {
    events.push({
      id: c.sha,
      kind: 'commit',
      at: Date.parse(c.committedAt),
      title: c.message,
      repo: c.repoFullName,
      url: `https://github.com/${c.repoFullName}/commit/${c.sha}`,
    })
  }
  for (const p of prs) {
    events.push({
      id: `pr${p.id}`,
      kind: 'pr',
      at: Date.parse(p.createdAt),
      title: p.title,
      repo: p.repoFullName,
      url: `https://github.com/${p.repoFullName}/pull/${p.number}`,
    })
  }
  for (const i of issues) {
    events.push({
      id: `issue${i.id}`,
      kind: 'issue',
      at: Date.parse(i.createdAt),
      title: i.title,
      repo: i.repoFullName,
      url: `https://github.com/${i.repoFullName}/issues/${i.number}`,
    })
  }
  return events.sort((a, b) => a.at - b.at)
}

/** Count events inside `range`; `events` must be sorted by `at`. */
export function countInRange(events: TimelineEvent[], range: Range): number {
  let lo = 0
  let hi = events.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (events[mid].at < range.start) lo = mid + 1
    else hi = mid
  }
  const first = lo
  hi = events.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (events[mid].at <= range.end) lo = mid + 1
    else hi = mid
  }
  return lo - first
}

export interface Range {
  start: number
  end: number
}

/** The full history window: first activity to now, never narrower than a day. */
export function initialBounds(events: TimelineEvent[], now: number): Range {
  if (events.length === 0) return { start: now - 24 * 3600_000, end: now }
  const first = events[0].at
  const last = Math.max(now, events.at(-1)!.at)
  return last - first < 24 * 3600_000 ? { start: first - 12 * 3600_000, end: last + 12 * 3600_000 } : { start: first, end: last }
}

export function clampRange(range: Range, bounds: Range, minSpan: number): Range {
  const boundsSpan = bounds.end - bounds.start
  let span = Math.min(range.end - range.start, boundsSpan)
  span = Math.max(span, minSpan)
  let start = Math.max(bounds.start, range.start)
  let end = start + span
  if (end > bounds.end) {
    end = bounds.end
    start = end - span
  }
  return { start, end }
}

/** Pan `range` by `shiftMs`, keeping the span and clamping to `bounds`. */
export function panRange(range: Range, shiftMs: number, bounds: Range, minSpan: number): Range {
  return clampRange({ start: range.start + shiftMs, end: range.end + shiftMs }, bounds, minSpan)
}

/** Zoom the range by `factor` (>= 1 zooms in) keeping `anchor` fixed in place. */
export function zoomRange(range: Range, factor: number, anchor: number): Range {
  const span = range.end - range.start
  const nextSpan = span / factor
  const t = Math.min(1, Math.max(0, (anchor - range.start) / span))
  return { start: anchor - nextSpan * t, end: anchor + nextSpan * (1 - t) }
}

export interface Buckets {
  commit: number[]
  pr: number[]
  issue: number[]
}

/** Split `range` into `n` equal buckets and count events per kind in each. */
export function bucketize(events: TimelineEvent[], range: Range, n: number): Buckets {
  const buckets: Buckets = { commit: new Array(n).fill(0), pr: new Array(n).fill(0), issue: new Array(n).fill(0) }
  const span = range.end - range.start
  for (const e of events) {
    if (e.at < range.start || e.at > range.end) continue
    let i = Math.floor(((e.at - range.start) / span) * n)
    if (i >= n) i = n - 1
    buckets[e.kind][i] += 1
  }
  return buckets
}

export interface AxisLabel {
  at: number
  label: string
}

export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const
export const pad2 = (n: number) => String(n).padStart(2, '0')

export const DAY_MS = 86400_000
// Nominal step widths used only to pick the label unit; iteration uses real
// calendar arithmetic (`next`), so labels never drift off their boundaries.
const UNITS = [
  { stepMs: 365 * DAY_MS, label: (d: Date) => String(d.getUTCFullYear()), next: (t: number) => Date.UTC(new Date(t).getUTCFullYear() + 1, 0, 1) },
  { stepMs: 30.5 * DAY_MS, label: (d: Date) => `${MONTHS[d.getUTCMonth()]} ${pad2(d.getUTCFullYear() % 100)}`, next: (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) } },
  { stepMs: DAY_MS, label: (d: Date) => `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}`, next: (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) } },
  { stepMs: 3600_000, label: (d: Date) => `${pad2(d.getUTCHours())}:00`, next: (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1) } },
] as const

/** Axis labels spaced so consecutive labels are at least `minGapPx` apart. */
export function axisLabels(range: Range, minGapPx: number, width: number): AxisLabel[] {
  const span = range.end - range.start
  const unit = [...UNITS].reverse().find((u) => (u.stepMs / span) * width >= minGapPx) ?? UNITS[UNITS.length - 1]
  const ticks: AxisLabel[] = []
  for (let t = unit.next(range.start - 1); t <= range.end; t = unit.next(t)) {
    ticks.push({ at: t, label: unit.label(new Date(t)) })
  }
  return ticks
}
