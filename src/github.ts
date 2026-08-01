import type { Commit, GitHubClient, Issue, PR, Repo } from './types.ts'
import { RateLimitError, SEARCH_PER_PAGE } from './types.ts'

const API = 'https://api.github.com'

interface RawCommit {
  sha: string
  commit: {
    message: string
    author: { name: string; date: string } | null
    committer: { date: string } | null
  }
  author: { login: string } | null
}

interface RawSearchItem {
  id: number
  number: number
  repository_url: string
  title: string
  created_at: string
}

interface RawRepo {
  full_name: string
}

export class GitHubApiClient implements GitHubClient {
  private readonly token: string

  constructor(token: string) {
    this.token = token
  }

  async listRepos(): Promise<Repo[]> {
    const repos: Repo[] = []
    for (let page = 1; ; page++) {
      const batch = await this.request<RawRepo[]>(
        `/user/repos?per_page=${SEARCH_PER_PAGE}&page=${page}&affiliation=owner,collaborator,organization_member&sort=updated`,
      )
      for (const repo of batch) repos.push({ fullName: repo.full_name })
      if (batch.length < SEARCH_PER_PAGE) break
    }
    return repos
  }

  async listCommits(repoFullName: string, author: string, until?: string): Promise<Commit[]> {
    const commits: Commit[] = []
    // GitHub's `until` is exclusive, but the engine's walk is inclusive
    // (`committedAt <= until`). Paginating internally keeps that contract, so a
    // same-timestamp cluster split across pages is returned whole and deduped
    // by SHA on re-walk instead of being dropped.
    // The slash must NOT be encoded: GitHub 404s on `%2F` in the path.
    const [owner, repo] = repoFullName.split('/')
    const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits`
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({ author, per_page: String(SEARCH_PER_PAGE), page: String(page) })
      if (until) query.set('until', until)
      const batch = await this.request<RawCommit[]>(`${base}?${query}`)
      for (const commit of batch) {
        commits.push({
          sha: commit.sha,
          repoFullName,
          message: commit.commit.message,
          author: commit.author?.login ?? '',
          committedAt: commit.commit.committer?.date ?? commit.commit.author?.date ?? '',
        })
      }
      if (batch.length < SEARCH_PER_PAGE) break
    }
    return commits
  }

  async searchPRs(author: string, page: number): Promise<PR[]> {
    return this.search(author, page, 'is:pr')
  }

  async searchIssues(author: string, page: number): Promise<Issue[]> {
    return this.search(author, page, 'is:issue')
  }

  private async search<T>(author: string, page: number, kind: string): Promise<T[]> {
    const query = new URLSearchParams({ q: `author:${author} ${kind}`, per_page: String(SEARCH_PER_PAGE), page: String(page) })
    const result = await this.request<{ items: RawSearchItem[] }>(`/search/issues?${query}`)
    // ponytail: search paginates to at most 1000 results; beyond that GitHub
    // returns nothing — a stated API ceiling, accepted.
    return result.items.map((item) => ({
      id: item.id,
      number: item.number,
      repoFullName: item.repository_url.replace(`${API}/repos/`, '').replace(/\?.*$/, ''),
      title: item.title,
      createdAt: item.created_at,
    })) as T[]
  }

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'github-history-timeline',
      },
    })
    this.assertRateLimit(res)
    if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText} for ${path}`)
    return res.json() as Promise<T>
  }

  private assertRateLimit(res: Response): void {
    if (res.status === 429) {
      // Secondary/abuse limits: retry-after is in seconds
      const retryAfter = Number(res.headers.get('retry-after'))
      throw new RateLimitError(new Date(Date.now() + (retryAfter > 0 ? retryAfter : 60) * 1000))
    }
    const remaining = res.headers.get('x-ratelimit-remaining')
    if (remaining === null || Number(remaining) !== 0) return
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    const resetAt = reset > 0 ? new Date(reset * 1000) : new Date(Date.now() + 60_000)
    throw new RateLimitError(resetAt)
  }
}
