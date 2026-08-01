import { cookies } from 'next/headers'

export const SESSION_COOKIE = 'ghs_session'
export const STATE_COOKIE = 'ghs_state'
const SECURE = process.env.NODE_ENV === 'production'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value
}

export async function setSessionCookie(token: string): Promise<void> {
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
}

export async function clearSessionCookie(): Promise<void> {
  ;(await cookies()).delete(SESSION_COOKIE)
}

export async function setStateCookie(state: string): Promise<void> {
  ;(await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
}

export async function stateToken(): Promise<string | undefined> {
  return (await cookies()).get(STATE_COOKIE)?.value
}

export async function clearStateCookie(): Promise<void> {
  ;(await cookies()).delete(STATE_COOKIE)
}
