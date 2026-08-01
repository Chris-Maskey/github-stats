import { crawl, SYNC_STATUS } from '../src/engine.ts'
import { GitHubApiClient } from '../src/github.ts'
import { getStorage } from './db.ts'

// ponytail: single-user app; a per-user map is the documented multi-user upgrade path
let current: Promise<void> | null = null

export function runCrawlOnce(login: string, token: string): Promise<void> {
  if (!current) {
    current = crawl(new GitHubApiClient(token), getStorage(), { author: login })
      // A dead crawl reports idle, not running — the UI must not lie. The
      // persisted cursors make the next triggered crawl resume exactly here.
      .catch(() => getStorage().setState(SYNC_STATUS, 'idle'))
      .finally(() => {
        current = null
      })
  }
  return current
}
