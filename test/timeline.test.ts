import { test } from 'node:test'
import assert from 'node:assert/strict'
import { axisLabels, bucketize, clampRange, countInRange, initialBounds, normalizeEvents, panRange, zoomRange } from '../lib/timeline.ts'
import type { Commit, Issue, PR } from '../src/types.ts'

const DAY_MS = 86400_000
const t0 = Date.UTC(2010, 0, 1)

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

function fixture() {
  const commits: Commit[] = [
    { sha: 'abc', repoFullName: 'a/repo', message: 'first commit', author: 'alice', committedAt: iso(t0) },
    { sha: 'def', repoFullName: 'a/repo', message: 'second commit', author: 'alice', committedAt: iso(t0 + DAY_MS) },
  ]
  const prs: PR[] = [
    { id: 1, number: 42, repoFullName: 'b/repo', title: 'add feature', createdAt: iso(t0 + 2 * DAY_MS) },
  ]
  const issues: Issue[] = [
    { id: 1, number: 7, repoFullName: 'b/repo', title: 'bug report', createdAt: iso(t0 + 3 * DAY_MS) },
  ]
  return { commits, prs, issues }
}

test('normalizeEvents sorts events and builds GitHub links per kind', () => {
  const { commits, prs, issues } = fixture()
  const events = normalizeEvents(commits, prs, issues)

  assert.deepEqual(events.map((e) => e.at), [t0, t0 + DAY_MS, t0 + 2 * DAY_MS, t0 + 3 * DAY_MS])
  assert.deepEqual(events.map((e) => e.kind), ['commit', 'commit', 'pr', 'issue'])
  assert.equal(events[0].url, 'https://github.com/a/repo/commit/abc')
  assert.equal(events[2].url, 'https://github.com/b/repo/pull/42')
  assert.equal(events[3].url, 'https://github.com/b/repo/issues/7')
})

test('bucketize counts each kind into the right bucket and drops out-of-range events', () => {
  const events = normalizeEvents(fixture().commits, fixture().prs, fixture().issues)
  // 4 days, 4 buckets: one event per day per bucket
  const range = { start: t0, end: t0 + 4 * DAY_MS }
  const buckets = bucketize(events, range, 4)
  assert.deepEqual(buckets.commit, [1, 1, 0, 0])
  assert.deepEqual(buckets.pr, [0, 0, 1, 0])
  assert.deepEqual(buckets.issue, [0, 0, 0, 1])

  const narrow = bucketize(events, { start: t0 + DAY_MS, end: t0 + 2 * DAY_MS }, 2)
  assert.deepEqual(narrow.commit, [1, 0], 'events before the range are excluded')
})

test('bucketize places an event exactly at range end in the last bucket', () => {
  const events = normalizeEvents(fixture().commits, [], [])
  const buckets = bucketize(events, { start: t0, end: t0 + 2 * DAY_MS }, 2)
  assert.deepEqual(buckets.commit, [1, 1])
})

test('zoomRange keeps the anchor time fixed while shrinking the span', () => {
  const range = { start: 0, end: 100 }
  const anchor = 75
  const zoomed = zoomRange(range, 2, anchor)
  assert.equal(zoomed.end - zoomed.start, 50)
  assert.equal((anchor - zoomed.start) / (zoomed.end - zoomed.start), 0.75, 'anchor keeps its relative position')
  assert.equal(zoomRange(range, 1, anchor).end - zoomRange(range, 1, anchor).start, 100)
})

test('clampRange keeps the span within bounds and at least the min span', () => {
  const bounds = { start: 0, end: 1000 }
  assert.deepEqual(clampRange({ start: -100, end: 500 }, bounds, 10), { start: 0, end: 600 })
  assert.deepEqual(clampRange({ start: 800, end: 1300 }, bounds, 10), { start: 500, end: 1000 })
  assert.deepEqual(clampRange({ start: 100, end: 90 }, bounds, 10), { start: 100, end: 110 }, 'min span wins')
  assert.deepEqual(clampRange({ start: -100, end: 2000 }, bounds, 10), { start: 0, end: 1000 }, 'wider than bounds collapses to bounds')
})

test('panRange shifts the range and clamps at the edges', () => {
  const bounds = { start: 0, end: 1000 }
  assert.deepEqual(panRange({ start: 100, end: 300 }, 50, bounds, 10), { start: 150, end: 350 })
  assert.deepEqual(panRange({ start: 100, end: 300 }, -500, bounds, 10), { start: 0, end: 200 }, 'clamps at the start edge')
  assert.deepEqual(panRange({ start: 100, end: 300 }, 900, bounds, 10), { start: 800, end: 1000 }, 'clamps at the end edge')
})

test('initialBounds spans first activity to now, padded when shorter than a day', () => {
  const events = normalizeEvents(fixture().commits, [], [])
  assert.deepEqual(initialBounds(events, t0 + 100 * DAY_MS), { start: t0, end: t0 + 100 * DAY_MS })
  assert.deepEqual(initialBounds([events[0]], t0 + 6 * 3600_000), { start: t0 - 12 * 3600_000, end: t0 + 18 * 3600_000 })
  assert.deepEqual(initialBounds([], t0), { start: t0 - 24 * 3600_000, end: t0 })
})

test('axisLabels picks year labels at decade scale and day labels at day scale', () => {
  const decade = axisLabels({ start: Date.UTC(2012, 5, 15), end: Date.UTC(2022, 5, 15) }, 60, 800)
  assert.deepEqual(decade.map((t) => t.label), ['2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'])
  assert.equal(decade[0].at, Date.UTC(2013, 0, 1))

  const days = axisLabels({ start: Date.UTC(2012, 0, 5), end: Date.UTC(2012, 0, 15) }, 60, 800)
  assert.deepEqual(days.map((t) => t.label), ['05 JAN', '06 JAN', '07 JAN', '08 JAN', '09 JAN', '10 JAN', '11 JAN', '12 JAN', '13 JAN', '14 JAN', '15 JAN'])
})

test('countInRange counts events inside the range on sorted events', () => {
  const events = normalizeEvents(fixture().commits, fixture().prs, fixture().issues)
  assert.equal(countInRange(events, { start: t0, end: t0 + 3 * DAY_MS }), 4)
  assert.equal(countInRange(events, { start: t0 + DAY_MS, end: t0 + 2 * DAY_MS }), 2)
  assert.equal(countInRange(events, { start: t0 - DAY_MS, end: t0 - 1 }), 0)
  assert.equal(countInRange(events, { start: t0 + 10 * DAY_MS, end: t0 + 20 * DAY_MS }), 0)
})
