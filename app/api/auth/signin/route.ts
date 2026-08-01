import { NextRequest, NextResponse } from 'next/server'
import { authorizeUrl, newState } from '@/lib/oauth'
import { setStateCookie } from '@/lib/session'

const SCOPE = 'repo read:user'

export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) {
    return NextResponse.redirect(new URL('/?error=config', req.url))
  }

  const state = newState()
  await setStateCookie(state)

  const redirectUri = `${req.nextUrl.origin}/api/auth/callback`
  return NextResponse.redirect(authorizeUrl({ clientId, state, redirectUri, scope: SCOPE }))
}
