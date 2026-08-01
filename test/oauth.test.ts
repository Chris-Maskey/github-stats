import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  authorizeUrl,
  exchangeCode,
  fetchGitHubUser,
  newState,
  safeEqual,
} from '../lib/oauth.ts'

test('authorizeUrl points at GitHub with client id, scope, redirect and state', () => {
  const url = new URL(
    authorizeUrl({
      clientId: 'client-1',
      state: 'state-abc',
      redirectUri: 'http://localhost:3000/api/auth/callback',
      scope: 'repo read:user',
    })
  )

  assert.equal(url.origin, 'https://github.com')
  assert.equal(url.pathname, '/login/oauth/authorize')
  assert.equal(url.searchParams.get('client_id'), 'client-1')
  assert.equal(url.searchParams.get('state'), 'state-abc')
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/api/auth/callback')
  assert.equal(url.searchParams.get('scope'), 'repo read:user')
  assert.equal(url.searchParams.get('response_type'), 'code')
})

test('newState returns a 64-char hex string, unique per call', () => {
  const a = newState()
  const b = newState()
  assert.match(a, /^[0-9a-f]{64}$/)
  assert.notEqual(a, b)
})

test('safeEqual is true for equal strings, false otherwise', () => {
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abc', 'abd'), false)
  assert.equal(safeEqual('a', 'aa'), false)
})

test('exchangeCode returns the token from GitHub', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = new URLSearchParams(init?.body as string)
    assert.equal(body.get('client_id'), 'client-1')
    assert.equal(body.get('client_secret'), 'secret-1')
    assert.equal(body.get('code'), 'code-x')
    assert.equal(body.get('redirect_uri'), 'http://localhost:3000/api/auth/callback')
    assert.equal(String(input), 'https://github.com/login/oauth/access_token')
    return new Response('access_token=gho_abc&token_type=bearer&scope=repo', {
      status: 200,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
  }) as typeof fetch
  try {
    const token = await exchangeCode({
      code: 'code-x',
      clientId: 'client-1',
      clientSecret: 'secret-1',
      redirectUri: 'http://localhost:3000/api/auth/callback',
    })
    assert.equal(token, 'gho_abc')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetchGitHubUser throws on a non-200 response', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('{"message":"Bad credentials"}', { status: 401 })) as typeof fetch
  try {
    await assert.rejects(fetchGitHubUser('gho_bad'), /HTTP 401/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('exchangeCode throws on an error response', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response('error=bad_verification_code&error_description=The+code+passed+is+incorrect', {
      status: 200,
    })) as typeof fetch
  try {
    await assert.rejects(
      exchangeCode({
        code: 'bad',
        clientId: 'client-1',
        clientSecret: 'secret-1',
        redirectUri: 'http://localhost:3000/api/auth/callback',
      }),
      /bad_verification_code/
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetchGitHubUser parses identity and sends the bearer token', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), 'https://api.github.com/user')
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer gho_abc')
    return new Response(
      JSON.stringify({
        id: 42,
        login: 'alice',
        avatar_url: 'https://avatars.example/alice.png',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }) as typeof fetch
  try {
    const user = await fetchGitHubUser('gho_abc')
    assert.equal(user.id, 42)
    assert.equal(user.login, 'alice')
    assert.equal(user.avatarUrl, 'https://avatars.example/alice.png')
  } finally {
    globalThis.fetch = originalFetch
  }
})
