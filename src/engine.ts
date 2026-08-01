import type { GitHubClient } from './types.ts'
import { RateLimitError, SEARCH_PER_PAGE } from './types.ts'
import type { Storage } from './storage.ts'

export const SYNC_STATUS = 'syncStatus'
export const RATE_LIMIT_RESET_AT = 'rateLimitResetAt'

export const CrawlStatus = {
  running: 'running',
  paused: 'paused',
  done: 'done',
} as const

export interface CrawlOptions {
  author: string
  delay?: (ms: number) => Promise<void>
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function withRateLimitPark<T>(fn: () => Promise<T>, delay: (ms: number) => Promise<void>, storage: Storage): Promise<T> {
  let wasParked = false
  for (;;) {
    try {
      const result = await fn()
      if (wasParked) {
        storage.setState(SYNC_STATUS, CrawlStatus.running)
        storage.setState(RATE_LIMIT_RESET_AT, '')
      }
      return result
    } catch (err) {
      if (err instanceof RateLimitError) {
        storage.setState(SYNC_STATUS, CrawlStatus.paused)
        storage.setState(RATE_LIMIT_RESET_AT, err.resetAt.toISOString())
        wasParked = true
        // Floor of 1s: a stale (past) resetAt must not spin into a busy loop.
        await delay(Math.max(1000, err.resetAt.getTime() - Date.now() + 1))
        continue
      }
      throw err
    }
  }
}

function previousMs(iso: string): string {
  return new Date(Date.parse(iso) - 1).toISOString()
}

async function paginate<T>(
  fetchPage: (page: number) => Promise<T[]>,
  insert: (items: T[]) => void,
  cursorKey: string,
  storage: Storage,
  delay: (ms: number) => Promise<void>,
): Promise<void> {
  let page = Number(storage.getState(cursorKey) ?? '1')
  for (;;) {
    const items = await withRateLimitPark(() => fetchPage(page), delay, storage)
    if (items.length === 0) break
    insert(items)
    if (items.length < SEARCH_PER_PAGE) break
    page += 1
    storage.setState(cursorKey, String(page))
  }
}

export async function crawl(client: GitHubClient, storage: Storage, options: CrawlOptions): Promise<void> {
  const { author } = options
  const delay = options.delay ?? sleep

  storage.setState(SYNC_STATUS, CrawlStatus.running)
  storage.setState(RATE_LIMIT_RESET_AT, '')

  for (const repo of await withRateLimitPark(() => client.listRepos(), delay, storage)) {
    storage.upsertRepo(repo.fullName)
    let until = storage.getRepoCursor(repo.fullName)
    for (;;) {
      const commits = await withRateLimitPark(() => client.listCommits(repo.fullName, author, until ?? undefined), delay, storage)
      if (commits.length === 0) break
      storage.insertCommits(commits)
      const oldest = commits.reduce((o, c) => (c.committedAt < o ? c.committedAt : o), commits[0].committedAt)
      // Walk is inclusive (`committedAt <= until`), so a same-timestamp cluster
      // straddling a page boundary is re-fetched (deduped by SHA) rather than lost.
      until = oldest === until ? previousMs(oldest) : oldest
      storage.setRepoCursor(repo.fullName, until)
    }
  }

  await paginate((p) => client.searchPRs(author, p), (items) => storage.insertPRs(items), 'prCursor', storage, delay)
  await paginate((p) => client.searchIssues(author, p), (items) => storage.insertIssues(items), 'issueCursor', storage, delay)

  storage.setState(SYNC_STATUS, CrawlStatus.done)
}
