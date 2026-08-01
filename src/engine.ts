import type { GitHubClient } from './types.ts'
import { RateLimitError, SEARCH_PER_PAGE } from './types.ts'
import type { Storage } from './storage.ts'

export interface CrawlOptions {
  delay?: (ms: number) => Promise<void>
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function call<T>(fn: () => Promise<T>, delay: (ms: number) => Promise<void>): Promise<T> {
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof RateLimitError) {
        await delay(err.resetAt.getTime() - Date.now() + 1)
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
    const items = await call(() => fetchPage(page), delay)
    if (items.length === 0) break
    insert(items)
    if (items.length < SEARCH_PER_PAGE) break
    page += 1
    storage.setState(cursorKey, String(page))
  }
}

export async function crawl(client: GitHubClient, storage: Storage, options: CrawlOptions = {}): Promise<void> {
  const delay = options.delay ?? sleep

  for (const repo of await call(() => client.listRepos(), delay)) {
    storage.upsertRepo(repo.fullName)
    let until = storage.getRepoCursor(repo.fullName)
    for (;;) {
      const commits = await call(() => client.listCommits(repo.fullName, until ?? undefined), delay)
      if (commits.length === 0) break
      storage.insertCommits(commits)
      until = previousMs(commits.reduce((oldest, c) => (c.committedAt < oldest ? c.committedAt : oldest), commits[0].committedAt))
      storage.setRepoCursor(repo.fullName, until)
    }
  }

  await paginate((p) => client.searchPRs(p), (items) => storage.insertPRs(items), 'prCursor', storage, delay)
  await paginate((p) => client.searchIssues(p), (items) => storage.insertIssues(items), 'issueCursor', storage, delay)
}
