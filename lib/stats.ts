import type { Repo } from '../src/types.ts'
import { DAY_MS } from './timeline.ts'
import type { TimelineEvent } from './timeline.ts'

export interface Stats {
  commits: number
  prs: number
  issues: number
  repos: number
  longestStreakDays: number
  languages: { language: string | null; count: number }[]
  firstAt: number | null
  lastAt: number | null
}

/** Longest run of consecutive UTC days with at least one event. */
export function longestStreakDays(atList: number[]): number {
  if (atList.length === 0) return 0
  const days = [...new Set(atList.map((t) => Math.floor(t / DAY_MS)))].sort((a, b) => a - b)
  let best = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1
    if (run > best) best = run
  }
  return best
}

function languageMix(repos: Repo[]): { language: string | null; count: number }[] {
  const counts = new Map<string | null, number>()
  for (const r of repos) counts.set(r.language, (counts.get(r.language) ?? 0) + 1)
  return [...counts.entries()]
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count || String(a.language ?? '').localeCompare(String(b.language ?? '')))
}

/** Aggregate stats derived from the synced history; pure — no DB access. */
export function computeStats(events: TimelineEvent[], repos: Repo[]): Stats {
  return {
    commits: events.filter((e) => e.kind === 'commit').length,
    prs: events.filter((e) => e.kind === 'pr').length,
    issues: events.filter((e) => e.kind === 'issue').length,
    repos: repos.length,
    longestStreakDays: longestStreakDays(events.map((e) => e.at)),
    languages: languageMix(repos),
    firstAt: events[0]?.at ?? null,
    lastAt: events.at(-1)?.at ?? null,
  }
}
