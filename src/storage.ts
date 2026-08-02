import { DatabaseSync } from 'node:sqlite'
import type { Commit, Issue, PR, Repo, Retrospective } from './types.ts'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS repos (
  full_name TEXT PRIMARY KEY,
  cursor TEXT,
  language TEXT
);
CREATE TABLE IF NOT EXISTS commits (
  sha TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  message TEXT NOT NULL,
  author TEXT NOT NULL,
  committed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prs (
  id INTEGER PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- One retrospective per user; the fingerprint records the stat blocks it was
-- generated from, so a mismatch flags the story stale.
CREATE TABLE IF NOT EXISTS retrospectives (
  user_id INTEGER PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  opener TEXT,
  chapters TEXT NOT NULL
);
`

export interface SyncProgress {
  minAt: string | null
  maxAt: string | null
}

export class Storage {
  readonly db: DatabaseSync

  private readonly upsertRepoStmt: ReturnType<DatabaseSync['prepare']>
  private readonly getCursorStmt: ReturnType<DatabaseSync['prepare']>
  private readonly setCursorStmt: ReturnType<DatabaseSync['prepare']>
  private readonly insertCommitStmt: ReturnType<DatabaseSync['prepare']>
  private readonly insertPRStmt: ReturnType<DatabaseSync['prepare']>
  private readonly insertIssueStmt: ReturnType<DatabaseSync['prepare']>
  private readonly getStateStmt: ReturnType<DatabaseSync['prepare']>
  private readonly setStateStmt: ReturnType<DatabaseSync['prepare']>
  private readonly getRetrospectiveStmt: ReturnType<DatabaseSync['prepare']>
  private readonly saveRetrospectiveStmt: ReturnType<DatabaseSync['prepare']>

  constructor(db: DatabaseSync) {
    this.db = db
    db.exec(SCHEMA)
    // Migration: DBs created before repo languages existed lack the column.
    const reposCols = db.prepare(`PRAGMA table_info(repos)`).all() as { name: string }[]
    if (!reposCols.some((c) => c.name === 'language')) db.exec(`ALTER TABLE repos ADD COLUMN language TEXT`)
    this.upsertRepoStmt = db.prepare(
      `INSERT INTO repos (full_name, language) VALUES (?, ?) ON CONFLICT (full_name) DO UPDATE SET language = excluded.language`,
    )
    this.getCursorStmt = db.prepare(`SELECT cursor FROM repos WHERE full_name = ?`)
    this.setCursorStmt = db.prepare(`UPDATE repos SET cursor = ? WHERE full_name = ?`)
    this.insertCommitStmt = db.prepare(
      `INSERT OR IGNORE INTO commits (sha, repo_full_name, message, author, committed_at) VALUES (?, ?, ?, ?, ?)`,
    )
    this.insertPRStmt = db.prepare(
      `INSERT OR IGNORE INTO prs (id, repo_full_name, number, title, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    this.insertIssueStmt = db.prepare(
      `INSERT OR IGNORE INTO issues (id, repo_full_name, number, title, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    this.getStateStmt = db.prepare(`SELECT value FROM sync_state WHERE key = ?`)
    this.setStateStmt = db.prepare(`INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
    this.getRetrospectiveStmt = db.prepare(`SELECT fingerprint, opener, chapters FROM retrospectives WHERE user_id = ?`)
    this.saveRetrospectiveStmt = db.prepare(
      `INSERT INTO retrospectives (user_id, fingerprint, opener, chapters) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET fingerprint = excluded.fingerprint, opener = excluded.opener, chapters = excluded.chapters`,
    )
  }

  upsertRepo(fullName: string, language: string | null): void {
    this.upsertRepoStmt.run(fullName, language)
  }

  listRepos(): Repo[] {
    return this.rows<{ full_name: string; language: string | null }>(`SELECT full_name, language FROM repos`).map((r) => ({
      fullName: r.full_name,
      language: r.language,
    }))
  }

  getRepoCursor(fullName: string): string | null {
    const row = this.getCursorStmt.get(fullName) as { cursor: string | null } | undefined
    return row?.cursor ?? null
  }

  setRepoCursor(fullName: string, cursor: string | null): void {
    this.setCursorStmt.run(cursor, fullName)
  }

  insertCommits(commits: Commit[]): void {
    for (const c of commits) {
      this.insertCommitStmt.run(c.sha, c.repoFullName, c.message, c.author, c.committedAt)
    }
  }

  insertPRs(prs: PR[]): void {
    for (const p of prs) {
      this.insertPRStmt.run(p.id, p.repoFullName, p.number, p.title, p.createdAt)
    }
  }

  insertIssues(issues: Issue[]): void {
    for (const i of issues) {
      this.insertIssueStmt.run(i.id, i.repoFullName, i.number, i.title, i.createdAt)
    }
  }

  listCommits(): Commit[] {
    return this.rows<{ sha: string; repo_full_name: string; message: string; author: string; committed_at: string }>(
      `SELECT sha, repo_full_name, message, author, committed_at FROM commits`,
    ).map((r) => ({
      sha: r.sha,
      repoFullName: r.repo_full_name,
      message: r.message,
      author: r.author,
      committedAt: r.committed_at,
    }))
  }

  listPRs(): PR[] {
    return this.rows<{ id: number; repo_full_name: string; number: number; title: string; created_at: string }>(
      `SELECT id, repo_full_name, number, title, created_at FROM prs`,
    ).map((r) => ({
      id: r.id,
      repoFullName: r.repo_full_name,
      number: r.number,
      title: r.title,
      createdAt: r.created_at,
    }))
  }

  listIssues(): Issue[] {
    return this.rows<{ id: number; repo_full_name: string; number: number; title: string; created_at: string }>(
      `SELECT id, repo_full_name, number, title, created_at FROM issues`,
    ).map((r) => ({
      id: r.id,
      repoFullName: r.repo_full_name,
      number: r.number,
      title: r.title,
      createdAt: r.created_at,
    }))
  }

  private rows<T>(sql: string): T[] {
    return this.db.prepare(sql).all() as T[]
  }

  /** Earliest and latest synced activity; null when nothing has landed yet. */
  syncProgress(): SyncProgress {
    const row = this.db
      .prepare(
        `SELECT MIN(at) AS min_at, MAX(at) AS max_at FROM (
           SELECT committed_at AS at FROM commits
           UNION ALL SELECT created_at AS at FROM prs
           UNION ALL SELECT created_at AS at FROM issues
         )`,
      )
      .get() as { min_at: string | null; max_at: string | null }
    return { minAt: row.min_at, maxAt: row.max_at }
  }

  getState(key: string): string | null {
    const row = this.getStateStmt.get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  setState(key: string, value: string): void {
    this.setStateStmt.run(key, value)
  }

  getRetrospective(userId: number): { fingerprint: string; retrospective: Retrospective } | null {
    const row = this.getRetrospectiveStmt.get(userId) as { fingerprint: string; opener: string | null; chapters: string } | undefined
    if (!row) return null
    return { fingerprint: row.fingerprint, retrospective: { opener: row.opener, chapters: JSON.parse(row.chapters) as Retrospective['chapters'] } }
  }

  saveRetrospective(userId: number, fingerprint: string, retrospective: Retrospective): void {
    this.saveRetrospectiveStmt.run(userId, fingerprint, retrospective.opener, JSON.stringify(retrospective.chapters))
  }
}
