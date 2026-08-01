import { NextResponse } from 'next/server'
import { getDb, getStorage } from '@/lib/db'
import { sessionToken } from '@/lib/session'
import { RATE_LIMIT_RESET_AT, SYNC_STATUS } from '@/src/engine'

export async function GET() {
  const token = await sessionToken()
  const user = token ? getDb().userBySession(token) : null
  if (!user) return NextResponse.json({ status: 'signed-out' })

  const storage = getStorage()
  const progress = storage.syncProgress()
  return NextResponse.json({
    status: storage.getState(SYNC_STATUS) ?? 'idle',
    rateLimitResetAt: storage.getState(RATE_LIMIT_RESET_AT),
    minAt: progress.minAt,
    maxAt: progress.maxAt,
  })
}
