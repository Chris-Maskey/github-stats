import { NextResponse } from 'next/server'
import { getDb, getStorage } from '@/lib/db'
import { sessionToken } from '@/lib/session'
import { CrawlStatus, SYNC_STATUS } from '@/src/engine'
import { runCrawlOnce } from '@/lib/sync'

export async function POST() {
  const token = await sessionToken()
  const user = token ? getDb().userBySession(token) : null
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const storage = getStorage()
  const status = storage.getState(SYNC_STATUS) ?? 'idle'
  // A completed crawl is never re-run from scratch; anything else (idle,
  // running, paused) is resumed from the persisted cursors.
  if (status !== CrawlStatus.done) {
    void runCrawlOnce(user.login, user.token)
    return NextResponse.json({ status: CrawlStatus.running })
  }
  return NextResponse.json({ status: CrawlStatus.done })
}
