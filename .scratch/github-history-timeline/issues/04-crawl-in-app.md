# 04 — Crawl wired into the app

**What to build:** The engine meets the real world. Signing in triggers a background crawl against the live GitHub API using the user's OAuth token; progress persists in SQLite so an interrupted crawl resumes on the next visit. A crawl that already completed does not re-run from scratch.

**Blocked by:** 01 — Scaffold + GitHub OAuth sign-in, 02 — Sync engine core

**Status:** ready-for-agent

- [ ] Login triggers the crawl with the user's token against the live API
- [ ] Crawl progress persists; app restart mid-crawl resumes rather than restarts
- [ ] Completed crawls are not re-run from scratch
- [ ] Crawl state (running / paused on rate limit / done) is observable in the UI
