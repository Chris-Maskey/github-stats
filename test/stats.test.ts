import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Repo } from '../src/types.ts'
import { DAY_MS } from '../lib/timeline.ts'
import type { TimelineEvent } from '../lib/timeline.ts'
import { computeStats } from '../lib/stats.ts'

function ev(kind: TimelineEvent['kind'], at: number): TimelineEvent {
  return { id: `${kind}-${at}`, kind, at, title: 't', repo: 'a/repo', url: 'https://github.com' }
}

function repo(fullName: string, language: string | null): Repo {
  return { fullName, language }
}

test('empty history yields zero totals, null spans, and no languages', () => {
  assert.deepEqual(computeStats([], []), {
    commits: 0,
    prs: 0,
    issues: 0,
    repos: 0,
    longestStreakDays: 0,
    languages: [],
    firstAt: null,
    lastAt: null,
  })
})

test('totals count events by kind and repos separately', () => {
  const events = [
    ev('commit', 1),
    ev('commit', 2),
    ev('pr', 3),
    ev('issue', 4),
  ]
  const stats = computeStats(events, [repo('a/repo', 'TypeScript'), repo('b/repo', 'Rust')])
  assert.equal(stats.commits, 2)
  assert.equal(stats.prs, 1)
  assert.equal(stats.issues, 1)
  assert.equal(stats.repos, 2)
})

test('longest streak counts consecutive UTC days of any activity', () => {
  const t0 = Date.UTC(2010, 0, 1)
  // Day 0, 1, 2 have activity; day 3 is empty; days 4-6 have activity.
  const events = [
    ev('commit', t0),
    ev('commit', t0 + 1 * DAY_MS),
    ev('pr', t0 + 2 * DAY_MS),
    ev('issue', t0 + 4 * DAY_MS),
    ev('commit', t0 + 5 * DAY_MS),
    ev('pr', t0 + 6 * DAY_MS),
  ]
  assert.equal(computeStats(events, []).longestStreakDays, 3)
})

test('a single activity day is a streak of one', () => {
  assert.equal(computeStats([ev('commit', Date.UTC(2010, 0, 1))], []).longestStreakDays, 1)
})

test('multiple events on the same day count once toward the streak', () => {
  const t0 = Date.UTC(2010, 0, 1)
  const events = [
    ev('commit', t0),
    ev('commit', t0 + 1 * DAY_MS),
    ev('pr', t0 + 1 * DAY_MS + 3_600_000),
  ]
  assert.equal(computeStats(events, []).longestStreakDays, 2)
})

test('spans are the first and last activity timestamps', () => {
  const t0 = Date.UTC(2010, 0, 1)
  const t1 = Date.UTC(2019, 5, 15)
  // events arrive sorted by `at` (normalizeEvents' contract)
  const stats = computeStats([ev('issue', t0), ev('commit', t1)], [])
  assert.equal(stats.firstAt, t0)
  assert.equal(stats.lastAt, t1)
})

test('language mix counts repos per language, sorted by count then name', () => {
  const repos = [
    repo('a/repo', 'TypeScript'),
    repo('b/repo', 'Rust'),
    repo('c/repo', 'TypeScript'),
    repo('d/repo', null),
    repo('e/repo', 'Rust'),
    repo('f/repo', 'Rust'),
  ]
  assert.deepEqual(computeStats([], repos).languages, [
    { language: 'Rust', count: 3 },
    { language: 'TypeScript', count: 2 },
    { language: null, count: 1 },
  ])
})
