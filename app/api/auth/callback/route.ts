import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { exchangeCode, fetchGitHubUser, newState, safeEqual } from '@/lib/oauth'
import { clearStateCookie, setSessionCookie, stateToken } from '@/lib/session'

export async function GET(req: NextRequest) {
  const error = (message: string) =>
    NextResponse.redirect(new URL(`/?error=${message}`, req.url))

  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) return error('config')

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const expected = await stateToken()
  await clearStateCookie()
  if (!code || !state || !expected || !safeEqual(state, expected)) return error('state')

  const redirectUri = `${req.nextUrl.origin}/api/auth/callback`
  let token: string
  try {
    token = await exchangeCode({ code, clientId, clientSecret, redirectUri })
  } catch {
    return error('github')
  }

  let user: { id: number; login: string; avatarUrl: string | null }
  try {
    user = await fetchGitHubUser(token)
  } catch {
    return error('github')
  }

  const sessionToken = newState()
  getDb().saveUser(
    { id: user.id, login: user.login, avatarUrl: user.avatarUrl ?? '', token },
    sessionToken,
  )
  await setSessionCookie(sessionToken)
  return NextResponse.redirect(new URL('/', req.url))
}
