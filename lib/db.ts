import { DatabaseSync } from 'node:sqlite'

export interface StoredUser {
  id: number
  login: string
  avatarUrl: string
  token: string
}

export interface Db {
  saveUser(user: StoredUser, sessionToken: string): void
  userBySession(sessionToken: string): StoredUser | null
  clearSession(sessionToken: string): void
}

let sharedDb: Db | null = null
export function getDb(): Db {
  return (sharedDb ??= openDb())
}

export function openDb(path = ':memory:'): Db {
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      login TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      token TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id)
    );
  `)
  const upsertUser = db.prepare(
    `INSERT INTO users (id, login, avatar_url, token) VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET login = excluded.login, avatar_url = excluded.avatar_url, token = excluded.token`,
  )
  const dropSessions = db.prepare(`DELETE FROM sessions WHERE user_id = ?`)
  const addSession = db.prepare(`INSERT INTO sessions (token, user_id) VALUES (?, ?)`)
  const userBySession = db.prepare(
    `SELECT u.id, u.login, u.avatar_url, u.token FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
  )
  const clearSession = db.prepare(`DELETE FROM sessions WHERE token = ?`)

  return {
    saveUser(user, session) {
      upsertUser.run(user.id, user.login, user.avatarUrl, user.token)
      dropSessions.run(user.id)
      addSession.run(session, user.id)
    },
    userBySession(session) {
      const row = userBySession.get(session) as Record<string, unknown> | undefined
      if (!row) return null
      return { id: row.id as number, login: row.login as string, avatarUrl: row.avatar_url as string, token: row.token as string }
    },
    clearSession(session) {
      clearSession.run(session)
    },
  }
}
