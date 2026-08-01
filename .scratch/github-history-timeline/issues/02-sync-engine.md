# 02 — Sync engine core

**What to build:** The crawl module — the heart of the app — built and proven on a bench before any UI exists. It enumerates the user's repos (owned + pushed-to), walks each repo's commits filtered by author, and fetches all authored PRs and issues via the search API, persisting everything to SQLite. Per-repo cursors make the crawl resumable: an interruption (app restart, network failure) resumes exactly where it stopped. Rate-limit exhaustion parks the crawl until reset. Commits deduplicate by SHA. The engine talks to GitHub only through an injected client and to storage only through the SQLite layer, so tests drive it with a fake GitHub client and in-memory SQLite.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] SQLite schema: repos, commits, PRs, issues — each with timestamp and repo reference
- [ ] Crawl of a fake client's full history persists every commit, PR, and issue
- [ ] Interrupted crawl (fake client fails mid-way) resumes from its cursor without losing or duplicating records
- [ ] Fake rate-limit exhaustion pauses the crawl; it continues after the simulated reset
- [ ] Commits deduplicate by SHA
- [ ] Storage layer and GitHub client are thin adapters; engine tests cover them through the fake
