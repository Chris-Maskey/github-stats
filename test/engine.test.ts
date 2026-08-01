import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { crawl, RATE_LIMIT_RESET_AT, SYNC_STATUS } from '../src/engine.ts'
import { Storage } from '../src/storage.ts'
import type { Commit, GitHubClient, Issue, PR, Repo } from '../src/types.ts'
import { RateLimitError, SEARCH_PER_PAGE } from '../src/types.ts'

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

type TableName = 'repos' | 'commits' | 'prs' | 'issues'

function rows(db: DatabaseSync, table: TableName) {
  return db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

interface FakeGitHubOptions {
  failCommitCall?: number
  failSearchPage?: number
  rateLimitOnCall?: number
  rateLimitResetMs?: number
}

class FakeGitHub implements GitHubClient {
  repos: Repo[] = []
  commits: Commit[] = []
  prs: PR[] = []
  issues: Issue[] = []

  readonly commitCalls: Array<{ repo: string; until: string | null }> = []
  readonly searchedPages = { prs: [] as number[], issues: [] as number[] }

  private callCount = 0

  readonly opts: FakeGitHubOptions

  constructor(opts: FakeGitHubOptions = {}) {
    this.opts = opts
  }

  async listRepos(): Promise<Repo[]> {
    this.bump()
    return this.repos
  }

  async listCommits(repoFullName: string, author: string, until?: string): Promise<Commit[]> {
    this.bump()
    this.commitCalls.push({ repo: repoFullName, until: until ?? null })
    if (this.opts.failCommitCall === this.commitCalls.length) {
      throw new Error('network failure while listing commits')
    }
    return this.commits
      .filter((c) => c.repoFullName === repoFullName && c.author === author && (until === undefined || c.committedAt <= until))
      .sort((a, b) => (a.committedAt < b.committedAt ? 1 : -1))
      .slice(0, 100)
  }

  async searchPRs(author: string, page: number): Promise<PR[]> {
    this.bump()
    this.searchedPages.prs.push(page)
    if (this.opts.failSearchPage === page) {
      throw new Error('network failure while searching PRs')
    }
    // ponytail: fake data is entirely the author's; the real client scopes the query
    return this.prs.slice((page - 1) * SEARCH_PER_PAGE, page * SEARCH_PER_PAGE)
  }

  async searchIssues(author: string, page: number): Promise<Issue[]> {
    this.bump()
    this.searchedPages.issues.push(page)
    if (this.opts.failSearchPage === page) {
      throw new Error('network failure while searching issues')
    }
    return this.issues.slice((page - 1) * SEARCH_PER_PAGE, page * SEARCH_PER_PAGE)
  }

  private bump() {
    this.callCount += 1
    if (this.opts.rateLimitOnCall === this.callCount) {
      const resetAt = new Date(Date.now() + (this.opts.rateLimitResetMs ?? 0))
      throw new RateLimitError(resetAt)
    }
  }
}

function makeFixture() {
  const t0 = Date.UTC(2010, 0, 1)
  const commits: Commit[] = []
  for (let i = 0; i < 120; i++) {
    commits.push({ sha: `a${i}`, repoFullName: 'a/repo', message: `commit a${i}`, author: 'alice', committedAt: iso(t0 + i * 86_400_000) })
  }
  for (let i = 0; i < 30; i++) {
    commits.push({ sha: `b${i}`, repoFullName: 'b/repo', message: `commit b${i}`, author: 'alice', committedAt: iso(t0 + i * 86_400_000) })
  }
  const prs: PR[] = []
  for (let i = 0; i < 150; i++) {
    prs.push({ id: i, number: i + 1, repoFullName: 'c/repo', title: `pr ${i}`, createdAt: iso(t0 + i * 3_600_000) })
  }
  const issues: Issue[] = []
  for (let i = 0; i < 50; i++) {
    issues.push({ id: i, number: i + 1, repoFullName: 'd/repo', title: `issue ${i}`, createdAt: iso(t0 + i * 3_600_000) })
  }
  return {
    commits,
    prs,
    issues,
    client() {
      const client = new FakeGitHub()
      client.repos = [{ fullName: 'a/repo' }, { fullName: 'b/repo' }, { fullName: 'empty/repo' }]
      client.commits = commits
      client.prs = prs
      client.issues = issues
      return client
    },
  }
}

test('a full crawl persists every commit, PR, and issue', async () => {
  const fx = makeFixture()
  const client = fx.client()
  const storage = new Storage(new DatabaseSync(':memory:'))

  await crawl(client, storage, { author: 'alice' })

  assert.equal(rows(storage.db, 'commits').length, 150)
  assert.equal(rows(storage.db, 'prs').length, 150)
  assert.equal(rows(storage.db, 'issues').length, 50)
  assert.equal(rows(storage.db, 'repos').length, 3)
  const commit = storage.db.prepare(`SELECT * FROM commits WHERE sha = 'a42'`).get() as Record<string, unknown>
  assert.equal(commit.message, 'commit a42')
  assert.equal(commit.repo_full_name, 'a/repo')
  assert.equal(commit.committed_at, iso(Date.UTC(2010, 0, 1) + 42 * 86_400_000))
})

test('only the author\'s commits are persisted', async () => {
  const fx = makeFixture()
  fx.commits.push({ sha: 'x1', repoFullName: 'a/repo', message: 'someone else\'s', author: 'mallory', committedAt: iso(Date.UTC(2010, 0, 1) + 5 * 86_400_000) })
  const client = fx.client()
  const storage = new Storage(new DatabaseSync(':memory:'))

  await crawl(client, storage, { author: 'alice' })

  assert.equal(rows(storage.db, 'commits').length, 150)
  const foreign = storage.db.prepare(`SELECT COUNT(*) AS n FROM commits WHERE author = 'mallory'`).get() as { n: number }
  assert.equal(foreign.n, 0)
})

test('an interrupted crawl resumes from its cursor without losing or duplicating records', async () => {
  const fx = makeFixture()
  const first = fx.client()
  first.opts.failCommitCall = 6
  const storage = new Storage(new DatabaseSync(':memory:'))

  await assert.rejects(crawl(first, storage, { author: 'alice' }), /network failure/)

  const second = fx.client()
  await crawl(second, storage, { author: 'alice' })

  assert.equal(rows(storage.db, 'commits').length, 150)
  assert.equal(rows(storage.db, 'prs').length, 150)
  assert.equal(rows(storage.db, 'issues').length, 50)

  const aCalls = second.commitCalls.filter((c) => c.repo === 'a/repo')
  assert.ok(aCalls.length <= 2, `finished repos must not be re-walked from the start, got ${aCalls.length} calls`)
  const bCalls = second.commitCalls.filter((c) => c.repo === 'b/repo')
  assert.equal(bCalls[0].until, first.commitCalls.at(-1)!.until, 'resume starts exactly where the failed crawl stopped')
})

test('an interrupted search phase resumes from the stored page', async () => {
  const fx = makeFixture()
  const first = fx.client()
  first.opts.failSearchPage = 2
  const storage = new Storage(new DatabaseSync(':memory:'))

  await assert.rejects(crawl(first, storage, { author: 'alice' }), /network failure/)
  assert.deepEqual(first.searchedPages.prs, [1, 2])

  const second = fx.client()
  await crawl(second, storage, { author: 'alice' })

  assert.equal(rows(storage.db, 'prs').length, 150)
  assert.deepEqual(second.searchedPages.prs, [2], 'page 1 must not be re-searched')
})

test('rate-limit exhaustion parks the crawl until reset, then continues', async () => {
  const fx = makeFixture()
  const client = fx.client()
  client.opts.rateLimitOnCall = 2
  client.opts.rateLimitResetMs = 10
  const storage = new Storage(new DatabaseSync(':memory:'))
  let sleptMs = 0

  await crawl(client, storage, { author: 'alice', delay: async (ms) => { sleptMs += ms } })

  assert.ok(sleptMs >= 10, `crawl must sleep past the reset, slept ${sleptMs}ms`)
  assert.equal(rows(storage.db, 'commits').length, 150)
  assert.equal(rows(storage.db, 'prs').length, 150)
  assert.equal(rows(storage.db, 'issues').length, 50)
})

test('a completed crawl leaves sync status done; an interrupted one stays running', async () => {
  const fx = makeFixture()
  const first = fx.client()
  first.opts.failCommitCall = 3
  const storage = new Storage(new DatabaseSync(':memory:'))

  await assert.rejects(crawl(first, storage, { author: 'alice' }), /network failure/)
  assert.equal(storage.getState(SYNC_STATUS), 'running', 'interrupted crawl stays running so the next visit resumes it')

  await crawl(fx.client(), storage, { author: 'alice' })
  assert.equal(storage.getState(SYNC_STATUS), 'done')
})

test('a rate-limit park marks sync status paused with the reset time, then completes done', async () => {
  const fx = makeFixture()
  const client = fx.client()
  client.opts.rateLimitOnCall = 2
  const resetMs = Date.now() + 5_000
  client.opts.rateLimitResetMs = resetMs - Date.now()
  const storage = new Storage(new DatabaseSync(':memory:'))
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })

  const crawlPromise = crawl(client, storage, {
    author: 'alice',
    delay: async () => { await gate },
  })

  await waitFor(() => storage.getState(SYNC_STATUS) === 'paused')
  const storedReset = Date.parse(storage.getState(RATE_LIMIT_RESET_AT) ?? '')
  assert.ok(
    storedReset >= resetMs && storedReset <= resetMs + 10,
    `stored reset ${storedReset} must be the fake's reset time ${resetMs}`,
  )

  release()
  await crawlPromise
  assert.equal(storage.getState(SYNC_STATUS), 'done')
  assert.equal(storage.getState(RATE_LIMIT_RESET_AT), '')
})

test('commits deduplicate by SHA', async () => {
  const fx = makeFixture()
  const client = fx.client()
  client.commits.push({ sha: 'a0', repoFullName: 'a/repo', message: 'duplicate', author: 'alice', committedAt: iso(Date.UTC(2010, 0, 1)) })
  client.commits.push({ sha: 'a1', repoFullName: 'a/repo', message: 'duplicate', author: 'alice', committedAt: iso(Date.UTC(2010, 0, 1) + 86_400_000) })
  const storage = new Storage(new DatabaseSync(':memory:'))

  await crawl(client, storage, { author: 'alice' })

  const stored = storage.db.prepare(`SELECT COUNT(*) AS n FROM commits WHERE sha IN ('a0', 'a1')`).get() as { n: number }
  assert.equal(stored.n, 2)
})

test('commits sharing a timestamp at a page boundary are not lost', async () => {
  const t0 = Date.UTC(2010, 0, 1)
  const commits: Commit[] = []
  for (let i = 0; i < 99; i++) {
    commits.push({ sha: `c${i}`, repoFullName: 'a/repo', message: `c${i}`, author: 'alice', committedAt: iso(t0 + (99 - i) * 86_400_000) })
  }
  // c99 and c100 share the oldest timestamp; the 100-per-page cut splits the pair
  commits.push({ sha: 'c99', repoFullName: 'a/repo', message: 'c99', author: 'alice', committedAt: iso(t0) })
  commits.push({ sha: 'c100', repoFullName: 'a/repo', message: 'c100', author: 'alice', committedAt: iso(t0) })
  const client = new FakeGitHub()
  client.repos = [{ fullName: 'a/repo' }]
  client.commits = commits
  const storage = new Storage(new DatabaseSync(':memory:'))

  await crawl(client, storage, { author: 'alice' })

  assert.equal(rows(storage.db, 'commits').length, 101)
})
