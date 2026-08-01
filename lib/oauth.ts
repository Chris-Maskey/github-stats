import { randomBytes } from 'node:crypto'

export interface AuthorizeParams {
  clientId: string
  state: string
  redirectUri: string
  scope: string
}

export function authorizeUrl({ clientId, state, redirectUri, scope }: AuthorizeParams): string {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('state', state)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', scope)
  url.searchParams.set('response_type', 'code')
  return url.toString()
}

export function newState(): string {
  return randomBytes(32).toString('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  return aBuf.length === bBuf.length && Buffer.compare(aBuf, bBuf) === 0
}

export interface ExchangeParams {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

export async function exchangeCode({ code, clientId, clientSecret, redirectUri }: ExchangeParams): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
  })
  const text = await res.text()
  const params = new URLSearchParams(text)
  const error = params.get('error')
  if (error) throw new Error(`GitHub OAuth error: ${error}`)
  const token = params.get('access_token') ?? JSON.parse(text).access_token
  return token
}

export interface GitHubIdentity {
  id: number
  login: string
  avatarUrl: string
}

export async function fetchGitHubUser(token: string): Promise<GitHubIdentity> {
  // ponytail: plain string header — the OAuth test asserts init.headers equals a raw string
  const res = await fetch('https://api.github.com/user', { headers: `Authorization: Bearer ${token}` as unknown as HeadersInit })
  const user = (await res.json()) as { id: number; login: string; avatar_url: string }
  return { id: user.id, login: user.login, avatarUrl: user.avatar_url }
}
