import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { TimelineEvent } from '../lib/timeline.ts'
import { computeYearStatBlocks } from '../lib/year-stats.ts'

let seq = 0

function ev(kind: TimelineEvent['kind'], at: number, repo = 'a/repo', title = 't'): TimelineEvent {
  const id = kind === 'commit' ? `sha${seq++}` : `${kind}${seq++}`
  return { id, kind, at, title, repo, url: 'https://github.com' }
}

const D = (y: number, m: number, d: number) => Date.UTC(y, m, d)

test('empty history yields no blocks', () => {
  assert.deepEqual(computeYearStatBlocks([]), [])
})

test('blocks are contiguous UTC calendar years from first to last activity', () => {
  // 23:30 UTC on Dec 31 2009 belongs to 2009 in any host timezone.
  const events = [ev('commit', Date.UTC(2009, 11, 31, 23, 30)), ev('commit', D(2011, 0, 5))]
  const blocks = computeYearStatBlocks(events)
  assert.deepEqual(blocks.map((b) => b.year), [2009, 2010, 2011])
})

test('an empty year in the middle renders an all-empty block', () => {
  const events = [ev('commit', D(2009, 0, 1)), ev('pr', D(2011, 0, 1))]
  const middle = computeYearStatBlocks(events)[1]
  assert.equal(middle.year, 2010)
  assert.equal(middle.commits, 0)
  assert.equal(middle.prs, 0)
  assert.equal(middle.issues, 0)
  assert.equal(middle.topRepo, null)
  assert.equal(middle.longestStreakDays, 0)
  assert.equal(middle.firstAt, null)
  assert.equal(middle.lastAt, null)
  assert.deepEqual(middle.sampledTitles, [])
})

test('counts by kind and spans are per-year', () => {
  const t0 = D(2009, 0, 1)
  const t1 = D(2009, 5, 15)
  const t2 = D(2010, 0, 1)
  const blocks = computeYearStatBlocks([ev('commit', t0), ev('issue', t1), ev('pr', t2)])
  assert.deepEqual(
    blocks.map((b) => ({ commits: b.commits, prs: b.prs, issues: b.issues, firstAt: b.firstAt, lastAt: b.lastAt })),
    [
      { commits: 1, prs: 0, issues: 1, firstAt: t0, lastAt: t1 },
      { commits: 0, prs: 1, issues: 0, firstAt: t2, lastAt: t2 },
    ],
  )
})

test('longest streak is computed within the year only', () => {
  // Days 1-3 have activity; day 4 is empty; days 5-6 have activity. The
  // activity on Jan 1 2011 is a separate year and does not extend the 2010 run.
  const events = [
    ev('commit', D(2010, 0, 1)),
    ev('commit', D(2010, 0, 2)),
    ev('pr', D(2010, 0, 3)),
    ev('commit', D(2010, 0, 5)),
    ev('pr', D(2010, 0, 6)),
    ev('commit', D(2011, 0, 1)),
  ]
  const blocks = computeYearStatBlocks(events)
  assert.equal(blocks[0].longestStreakDays, 3)
  assert.equal(blocks[1].longestStreakDays, 1)
})

test('top repo is the most active in the year, ties break lexicographically', () => {
  const events = [
    ev('commit', D(2010, 0, 1), 'b/repo'),
    ev('commit', D(2010, 0, 2), 'b/repo'),
    ev('pr', D(2010, 0, 3), 'a/repo'),
    ev('pr', D(2010, 0, 4), 'a/repo'),
  ]
  assert.equal(computeYearStatBlocks(events)[0].topRepo, 'a/repo')
})

test('sampled titles include commit and PR titles only, never issues', () => {
  const events = [
    ev('commit', D(2010, 0, 1), 'a/repo', 'commit one'),
    ev('pr', D(2010, 0, 2), 'a/repo', 'pr one'),
    ev('issue', D(2010, 0, 3), 'b/repo', 'issue one'),
    ev('issue', D(2010, 0, 4), 'b/repo', 'issue two'),
  ]
  const titles = computeYearStatBlocks(events)[0].sampledTitles
  assert.deepEqual(titles.map((t) => t.title), ['commit one', 'pr one'])
  assert.ok(titles.every((t) => t.title !== 'issue one' && t.title !== 'issue two'))
})

test('sampled titles follow the priority rules: peak-commit day, most-active repo, first, last, then filler', () => {
  // Day 1: three commits in a/repo (peak-commit day). Day 2: two commits in
  // b/repo. Day 3: a PR in a/repo (last event; a/repo is most active with 4).
  const events = [
    ev('commit', D(2010, 0, 1), 'a/repo', 'a1'),
    ev('commit', D(2010, 0, 1), 'a/repo', 'a2'),
    ev('commit', D(2010, 0, 1), 'a/repo', 'a3'),
    ev('commit', D(2010, 0, 2), 'b/repo', 'b1'),
    ev('commit', D(2010, 0, 2), 'b/repo', 'b2'),
    ev('pr', D(2010, 0, 3), 'a/repo', 'pr1'),
  ]
  const sampled = computeYearStatBlocks(events)[0].sampledTitles
  assert.deepEqual(sampled.map((t) => `${t.repo}:${t.title}`), ['a/repo:a1', 'a/repo:a2', 'a/repo:a3', 'a/repo:pr1', 'b/repo:b1', 'b/repo:b2'])
})

test('sampled titles cap at ten', () => {
  const events = Array.from({ length: 12 }, (_, i) => ev('commit', D(2010, 0, 1), 'a/repo', `c${i}`))
  const sampled = computeYearStatBlocks(events)[0].sampledTitles
  assert.equal(sampled.length, 10)
  assert.deepEqual(sampled.map((t) => t.title), Array.from({ length: 10 }, (_, i) => `c${i}`))
})

test('a year with only issues has no sampled titles', () => {
  const events = [ev('issue', D(2010, 0, 1), 'a/repo', 'issue one')]
  assert.deepEqual(computeYearStatBlocks(events)[0].sampledTitles, [])
})

test('same input twice yields identical blocks (determinism)', () => {
  const events = [
    ev('commit', D(2009, 0, 1), 'a/repo', 'a1'),
    ev('commit', D(2009, 0, 2), 'b/repo', 'b1'),
    ev('pr', D(2011, 0, 3), 'a/repo', 'p1'),
  ]
  assert.deepEqual(computeYearStatBlocks(events), computeYearStatBlocks(events))
})
