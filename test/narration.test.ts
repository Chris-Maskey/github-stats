import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { generateRetrospective, loadRetrospective } from '../src/narration.ts'
import { Storage } from '../src/storage.ts'
import type { Narrator } from '../src/types.ts'
import type { TimelineEvent } from '../lib/timeline.ts'

let seq = 0

function ev(kind: TimelineEvent['kind'], at: number, repo = 'a/repo', title = 't'): TimelineEvent {
  const id = kind === 'commit' ? `sha${seq++}` : `${kind}${seq++}`
  return { id, kind, at, title, repo, url: 'https://github.com' }
}

const D = (y: number, m: number, d: number) => Date.UTC(y, m, d)

function makeNarrator(opts: { failIf?: (prompt: string) => boolean } = {}) {
  const calls: string[] = []
  const narrator: Narrator = async (prompt) => {
    calls.push(prompt)
    if (opts.failIf?.(prompt)) throw new Error('narrator failed')
    return `narration #${calls.length}`
  }
  return { calls, narrator }
}

function makeStorage() {
  return new Storage(new DatabaseSync(':memory:'))
}

test('one narrator call per active year plus the opener, opener strictly last', async () => {
  const events = [ev('commit', D(2009, 0, 1)), ev('pr', D(2011, 0, 1))]
  const { calls, narrator } = makeNarrator()
  const storage = makeStorage()

  const retrospective = await generateRetrospective({ events, userId: 1, storage, narrator })

  assert.equal(calls.length, 3, 'two active years plus the opener')
  assert.ok(calls[0].includes('2009'), 'first call is the 2009 chapter')
  assert.ok(calls[1].includes('2011'), 'second call is the 2011 chapter')
  assert.ok(calls[2].includes('LIFETIME TOTALS'), 'last call is the opener')
  assert.equal(retrospective.chapters.length, 3, 'a chapter exists for the empty 2010 too')
  assert.deepEqual(
    retrospective.chapters.map((c) => ({ year: c.year, narrated: c.narration !== null })),
    [
      { year: 2009, narrated: true },
      { year: 2010, narrated: false },
      { year: 2011, narrated: true },
    ],
  )
  assert.ok(retrospective.opener !== null)
})

test('a cache hit with an unchanged fingerprint performs zero narrator calls', async () => {
  const events = [ev('commit', D(2009, 0, 1)), ev('commit', D(2010, 0, 1))]
  const storage = makeStorage()

  const first = makeNarrator()
  await generateRetrospective({ events, userId: 1, storage, narrator: first.narrator })
  assert.ok(first.calls.length > 0)

  const second = makeNarrator()
  await generateRetrospective({ events, userId: 1, storage, narrator: second.narrator })

  assert.equal(second.calls.length, 0, 'unchanged data must not re-pay for generation')
})

test('force regenerates even on a fresh cache hit — the deliberate-click retry path', async () => {
  const events = [ev('commit', D(2009, 0, 1))]
  const storage = makeStorage()
  await generateRetrospective({ events, userId: 1, storage, narrator: makeNarrator().narrator })

  const forced = makeNarrator()
  await generateRetrospective({ events, userId: 1, storage, narrator: forced.narrator, force: true })

  assert.ok(forced.calls.length > 0, 'an explicit regeneration request always fires the narrator')
})

test('the fingerprint includes user identity, so identical data does not share a cache', async () => {
  const events = [ev('commit', D(2009, 0, 1))]
  const storage = makeStorage()
  const first = makeNarrator()
  const second = makeNarrator()

  await generateRetrospective({ events, userId: 1, storage, narrator: first.narrator })
  await generateRetrospective({ events, userId: 2, storage, narrator: second.narrator })

  assert.ok(second.calls.length > 0, 'user 2 must not hit user 1\'s cached story')
  assert.notEqual(storage.getRetrospective(1)?.fingerprint, storage.getRetrospective(2)?.fingerprint)
})

test('a throwing narrator leaves that chapter stat-block-only, retries once, and the story still caches', async () => {
  const events = [ev('commit', D(2009, 0, 1)), ev('commit', D(2010, 0, 1))]
  const { calls, narrator } = makeNarrator({ failIf: (p) => p.includes('STATS FOR 2010') })
  const storage = makeStorage()

  const retrospective = await generateRetrospective({ events, userId: 1, storage, narrator })

  assert.equal(calls.filter((p) => p.includes('STATS FOR 2010')).length, 2, 'one retry per failed chapter, no loop')
  assert.equal(retrospective.chapters[0].narration, 'narration #1')
  assert.equal(retrospective.chapters[1].narration, null, 'failed chapter is stat-block-only')
  assert.ok(retrospective.opener !== null, 'the opener still lands after a failed chapter')

  const reload = loadRetrospective({ events, userId: 1, storage })
  assert.equal(reload.stale, false, 'the story cached despite the failed chapter')
  assert.equal(reload.retrospective?.chapters[1].narration, null)

  const again = makeNarrator()
  await generateRetrospective({ events, userId: 1, storage, narrator: again.narrator })
  assert.equal(again.calls.length, 0, 'the cached story with its failed chapter is reused, not re-fired')

  const retried = makeNarrator()
  await generateRetrospective({ events, userId: 1, storage, narrator: retried.narrator, force: true })
  assert.ok(retried.calls.length > 0, 'a forced regeneration retries the failed chapter')
})

test('empty years produce no narrator calls and no narration', async () => {
  const events = [ev('commit', D(2009, 0, 1)), ev('commit', D(2011, 0, 1))]
  const { calls, narrator } = makeNarrator()
  const storage = makeStorage()

  const retrospective = await generateRetrospective({ events, userId: 1, storage, narrator })

  assert.equal(calls.length, 3, '2009, 2011, and the opener only')
  assert.ok(calls.every((p) => !p.includes('STATS FOR 2010')), 'the empty year is never sent to the narrator')
  assert.equal(retrospective.chapters.find((c) => c.year === 2010)?.narration, null)
})

test('empty history produces zero narrator calls and caches an empty story', async () => {
  const { calls, narrator } = makeNarrator()
  const storage = makeStorage()

  const retrospective = await generateRetrospective({ events: [], userId: 1, storage, narrator })

  assert.equal(calls.length, 0)
  assert.deepEqual(retrospective, { opener: null, chapters: [] })
  const cached = loadRetrospective({ events: [], userId: 1, storage })
  assert.equal(cached.stale, false)
  assert.deepEqual(cached.retrospective, retrospective)
})

test('a changed fingerprint flags the story stale; regeneration happens only on an explicit call', async () => {
  const events = [ev('commit', D(2009, 0, 1))]
  const storage = makeStorage()
  await generateRetrospective({ events, userId: 1, storage, narrator: makeNarrator().narrator })

  assert.equal(loadRetrospective({ events, userId: 1, storage }).stale, false)

  const grown = [...events, ev('pr', D(2010, 0, 1))]
  const stale = loadRetrospective({ events: grown, userId: 1, storage })
  assert.equal(stale.stale, true, 'new data flags the story stale')
  assert.equal(stale.retrospective?.chapters.length, 1, 'the stale story is still the cached one')

  const fresh = makeNarrator()
  await generateRetrospective({ events: grown, userId: 1, storage, narrator: fresh.narrator })
  assert.ok(fresh.calls.length > 0, 'explicit generation regenerates')
  assert.equal(loadRetrospective({ events: grown, userId: 1, storage }).stale, false)
})

test('every prompt contains only content derivable from the stat blocks (assertion rule)', async () => {
  // Twelve same-day commits in the same repo: sampling caps at ten, so c10 and
  // c11 never enter a prompt. Issue titles are never sampled at all.
  const events = Array.from({ length: 12 }, (_, i) => ev('commit', D(2010, 0, 1), 'a/repo', `c${i}`))
  events.push(ev('issue', D(2010, 0, 2), 'a/repo', 'zebra-issue-title'))
  const { calls, narrator } = makeNarrator()
  const storage = makeStorage()

  await generateRetrospective({ events, userId: 1, storage, narrator })

  const all = calls.join('\n')
  for (const prompt of calls) {
    assert.ok(!prompt.includes('zebra'), 'issue titles never reach the narrator')
    assert.ok(!prompt.includes('c10') && !prompt.includes('c11'), 'unsampled titles never reach the narrator')
    assert.ok(!prompt.includes('sha'), 'no raw event identity leaks into prompts')
  }
  assert.ok(all.includes('c0') && all.includes('c9'), 'sampled titles are handed over')
})

test('the opener prompt is built from lifetime totals and every year\'s stat block', async () => {
  const events = [ev('commit', D(2009, 0, 1)), ev('commit', D(2009, 0, 2)), ev('pr', D(2010, 0, 1))]
  const { calls, narrator } = makeNarrator()
  const storage = makeStorage()

  await generateRetrospective({ events, userId: 1, storage, narrator })

  const opener = calls.at(-1)!
  assert.ok(opener.includes('LIFETIME TOTALS'))
  assert.ok(opener.includes('total commits: 2'))
  assert.ok(opener.includes('total pull requests: 1'))
  assert.ok(opener.includes('2009') && opener.includes('2010'), 'opener sees every year\'s block')
  assert.ok(opener.includes('a/repo'))
})
