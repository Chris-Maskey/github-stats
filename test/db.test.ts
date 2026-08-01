import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb, type StoredUser } from '../lib/db.ts'

function freshDb() {
  return openDb(':memory:')
}

const alice: StoredUser = {
  id: 42,
  login: 'alice',
  avatarUrl: 'https://avatars.example/alice.png',
  token: 'gho_alice-token',
}

test('saved user is returned by session token', () => {
  const db = freshDb()
  db.saveUser(alice, 'session-1')

  const user = db.userBySession('session-1')
  assert.equal(user?.login, 'alice')
  assert.equal(user?.id, 42)
  assert.equal(user?.avatarUrl, 'https://avatars.example/alice.png')
})

test('re-sign-in replaces the token and session for the same GitHub id', () => {
  const db = freshDb()
  db.saveUser(alice, 'session-1')
  db.saveUser({ ...alice, login: 'alice2', token: 'gho_new' }, 'session-2')

  assert.equal(db.userBySession('session-1'), null)
  assert.equal(db.userBySession('session-2')?.token, 'gho_new')
  assert.equal(db.userBySession('session-2')?.login, 'alice2')
})

test('unknown session token returns null', () => {
  const db = freshDb()
  db.saveUser(alice, 'session-1')
  assert.equal(db.userBySession('nope'), null)
})

test('clearSession removes the session', () => {
  const db = freshDb()
  db.saveUser(alice, 'session-1')
  db.clearSession('session-1')
  assert.equal(db.userBySession('session-1'), null)
})
