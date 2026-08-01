export interface Repo {
  fullName: string
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

export const SEARCH_PER_PAGE = 100

export interface GitHubClient {
  listRepos(): Promise<Repo[]>
  listCommits(repoFullName: string, until?: string): Promise<Commit[]>
  searchPRs(page: number): Promise<PR[]>
  searchIssues(page: number): Promise<Issue[]>
}

export class RateLimitError extends Error {
  readonly resetAt: Date

  constructor(resetAt: Date) {
    super('GitHub rate limit exhausted')
    this.resetAt = resetAt
  }
}
