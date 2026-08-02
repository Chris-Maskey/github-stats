import { DAY_MS } from './timeline.ts'
import type { TimelineEvent } from './timeline.ts'
import { longestStreakDays } from './stats.ts'

export interface SampledTitle {
  /** The underlying event's id (commit sha or pr id) — stable identity for rendering keys. */
  id: string
  title: string
  repo: string
  at: number
}

export interface YearStatBlock {
  year: number
  commits: number
  prs: number
  issues: number
  topRepo: string | null
  longestStreakDays: number
  firstAt: number | null
  lastAt: number | null
  sampledTitles: SampledTitle[]
}

const TITLE_CAP = 10

const utcYear = (at: number) => new Date(at).getUTCFullYear()

/**
 * Per-UTC-calendar-year stat blocks; pure — no DB access. `events` must be
 * sorted by `at` (normalizeEvents' contract). Empty history yields no blocks.
 */
export function computeYearStatBlocks(events: TimelineEvent[]): YearStatBlock[] {
  if (events.length === 0) return []
  const byYear = new Map<number, TimelineEvent[]>()
  for (const e of events) {
    const list = byYear.get(utcYear(e.at)) ?? []
    list.push(e)
    byYear.set(utcYear(e.at), list)
  }
  const blocks: YearStatBlock[] = []
  for (let year = utcYear(events[0].at); year <= utcYear(events.at(-1)!.at); year++) {
    blocks.push(blockForYear(year, byYear.get(year) ?? []))
  }
  return blocks
}

function blockForYear(year: number, events: TimelineEvent[]): YearStatBlock {
  const repo = topRepo(events)
  return {
    year,
    commits: events.filter((e) => e.kind === 'commit').length,
    prs: events.filter((e) => e.kind === 'pr').length,
    issues: events.filter((e) => e.kind === 'issue').length,
    topRepo: repo,
    longestStreakDays: longestStreakDays(events.map((e) => e.at)),
    firstAt: events[0]?.at ?? null,
    lastAt: events.at(-1)?.at ?? null,
    sampledTitles: sampleTitles(events, repo),
  }
}

/** The repo with the most events in the year; ties break lexicographically. */
function topRepo(events: TimelineEvent[]): string | null {
  const counts = new Map<string, number>()
  for (const e of events) counts.set(e.repo, (counts.get(e.repo) ?? 0) + 1)
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return sorted[0]?.[0] ?? null
}

/**
 * Deterministic title sample: commit/PR titles only, ~5–10 per year, chosen by
 * priority — peak-commit day, most-active repo, first and last, then filler in
 * chronological order, deduped by event id.
 * ponytail: a few passes over the year's events; single-pass accumulation if
 * years × events ever grows large enough to matter.
 */
function sampleTitles(events: TimelineEvent[], repo: string | null): SampledTitle[] {
  const cands: TimelineEvent[] = []
  const seen = new Set<string>()
  const add = (list: TimelineEvent[]) => {
    for (const e of list) {
      if (cands.length >= TITLE_CAP) return
      if (seen.has(e.id) || e.kind === 'issue') continue
      seen.add(e.id)
      cands.push(e)
    }
  }
  add(peakDayCommits(events))
  add(events.filter((e) => e.repo === repo))
  const commitOrPr = events.filter((e) => e.kind !== 'issue')
  add(commitOrPr.slice(0, 1))
  add(commitOrPr.slice(-1))
  add(events)
  return cands.map((e) => ({ id: e.id, title: e.title, repo: e.repo, at: e.at }))
}

/** Commits of the UTC day with the most commits; the earliest such day wins ties. */
function peakDayCommits(events: TimelineEvent[]): TimelineEvent[] {
  const byDay = new Map<number, TimelineEvent[]>()
  for (const e of events) {
    if (e.kind !== 'commit') continue
    const day = Math.floor(e.at / DAY_MS)
    const list = byDay.get(day) ?? []
    list.push(e)
    byDay.set(day, list)
  }
  let bestDay: number | null = null
  let bestCount = 0
  for (const [day, list] of byDay) {
    if (list.length > bestCount) {
      bestCount = list.length
      bestDay = day
    }
  }
  return bestDay === null ? [] : byDay.get(bestDay)!
}
