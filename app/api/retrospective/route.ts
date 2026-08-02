import { NextResponse } from 'next/server'
import { getDb, getStorage } from '@/lib/db'
import { sessionToken } from '@/lib/session'
import { normalizeEvents } from '@/lib/timeline'
import { generateRetrospective } from '@/src/narration'
import { geminiNarrator } from '@/src/narrator'

// The deliberate-click regeneration request: generation never happens on a
// page read, only here. force regenerates even a fresh cache so a failed
// chapter can be retried.
export async function POST() {
  const token = await sessionToken()
  const user = token ? getDb().userBySession(token) : null
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const storage = getStorage()
  const events = normalizeEvents(storage.listCommits(), storage.listPRs(), storage.listIssues())
  const retrospective = await generateRetrospective({
    events,
    userId: user.id,
    storage,
    narrator: geminiNarrator,
    force: true,
  })
  return NextResponse.json({ retrospective })
}
