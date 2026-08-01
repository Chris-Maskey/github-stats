import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { clearSessionCookie, sessionToken } from '@/lib/session'

export async function POST(req: NextRequest) {
  const token = await sessionToken()
  if (token) getDb().clearSession(token)
  await clearSessionCookie()
  return NextResponse.redirect(new URL('/', req.url))
}
