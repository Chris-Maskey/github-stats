export interface Repo {
  fullName: string
  /** Primary language GitHub reports for the repo; null when it detects none. */
  language: string | null
}

export interface Commit {
  sha: string
  repoFullName: string
  message: string
  author: string
  committedAt: string
}

export interface PR {
  id: number
  number: number
  repoFullName: string
  title: string
  createdAt: string
}

export interface Issue {
  id: number
  number: number
  repoFullName: string
  title: string
  createdAt: string
}

// Page size the GitHub search API honors; a client's page is full until it
// returns fewer than this, which the engine uses as its end-of-pagination signal.
export const SEARCH_PER_PAGE = 100

export interface GitHubClient {
  listRepos(): Promise<Repo[]>
  /** Authored commits of `repoFullName`, newest first, `committedAt <= until`. */
  listCommits(repoFullName: string, author: string, until?: string): Promise<Commit[]>
  searchPRs(author: string, page: number): Promise<PR[]>
  searchIssues(author: string, page: number): Promise<Issue[]>
}

export interface Chapter {
  year: number
  /** null when the year had no activity or narration failed — stat block only. */
  narration: string | null
}

export interface Retrospective {
  /** null when generation failed or there was nothing to narrate. */
  opener: string | null
  chapters: Chapter[]
}

/** The single (prompt) → text seam; the Gemini adapter is its only real implementation. */
export type Narrator = (prompt: string) => Promise<string>

export class RateLimitError extends Error {
  readonly resetAt: Date

  constructor(resetAt: Date) {
    super('GitHub rate limit exhausted')
    this.resetAt = resetAt
  }
}
