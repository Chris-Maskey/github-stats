# Spec: GitHub History Timeline

Status: ready-for-agent
Feature: github-history-timeline

## Problem Statement

GitHub's own profile page shows a shallow one-year contribution calendar. A user with a decade of GitHub history has no way to see their entire history as a continuous picture — the story of everything they've touched, from their first push to today. Existing "GitHub stats" apps rehash the contribution calendar; none show the full history.

The user's entire history is also not trivially accessible: GitHub's API has no global "all commits by user" endpoint, a 5,000-request/hour rate cap, and a 90-day ceiling on the events stream. Fetching full history requires walking every repo the user has access to, which takes hours to days of background crawling.

## Solution

A single-user web app ("github-stats"). The user signs in with GitHub OAuth. The app crawls their entire history in the background — commits from every repo they own or have pushed to, plus every PR and issue they've authored — and stores it in SQLite. The history is rendered as a continuous, zoomable timeline from their first activity to today, with every commit, PR, and issue as a tick. Aggregate stats (totals, streaks, languages, spans) are derived from the same synced data.

The crawl itself is part of the experience: the timeline visibly fills in from the past forward ("Syncing 2009–2026…") behind a Dot Matrix loader. The wait is the eye candy.

The app is honest about its limits: one UI line acknowledges that deleted repos leave holes no one — including GitHub itself — can fill.

## User Stories

1. As a user, I want to sign in with GitHub OAuth, so that the app can access my history with my own token.
2. As a user, I want the app to crawl my entire history in the background, so that I don't have to wait for a complete picture before using it.
3. As a user, I want the crawl to resume after interruptions (app restart, network failure, rate-limit exhaustion), so that partial progress is never lost or duplicated.
4. As a user, I want the crawl to respect GitHub's rate limits automatically, so that it pauses when quota runs out and continues when it resets.
5. As a user, I want the crawl to fetch commits from every repo I own or have pushed to, so that the timeline spine reflects my real activity.
6. As a user, I want every PR and issue I've authored woven into the same timeline, so that the story includes projects I contributed to without committing.
7. As a user, I want to see a continuous timeline from my first activity to today, so that I can watch my history unfold as one picture.
8. As a user, I want to zoom from decade-scale down to day-scale, so that I can see both the shape of my whole history and the detail of a single day.
9. As a user, I want commits, PRs, and issues rendered as visually distinct ticks, so that I can tell the layers apart at a glance.
10. As a user, I want to click or hover a tick to see its details (message/title, repo, date, link to GitHub), so that I can revisit specific moments.
11. As a user, I want the timeline to aggregate at low zoom levels, so that a decade of activity doesn't become an unreadable wall of pixels.
12. As a user, I want to see the sync progress as the timeline fills in from the past forward, so that the crawl feels like part of the experience, not a loading bar.
13. As a user, I want to see aggregate stats derived from the synced data — totals, longest streaks, languages, first/last activity spans — so that I get the numbers without a separate system.
14. As a user, I want previously synced data loaded from the local database on return visits, so that I don't re-crawl my history every time.
15. As a user, I want one honest line noting that deleted repos are missing from the picture, so that the holes are acknowledged rather than silently hidden.

## Implementation Decisions

- **Stack**: Next.js (single process) + SQLite + Tailwind. All UI, auth, crawl, and storage live in one app. No separate worker process.
- **UI ecosystem**: shadcn registry components. Skiper UI for components, Animate UI icons (animated Lucide icons via Motion), Geist Pixel for display type (timeline ticks, big numbers, sync headers) with Geist Sans for body text — pixel fonts are display-only, never below ~12px. Dot Matrix loaders for all sync states. Skiper UI free-tier attribution credit is required in the app (footer/about).
- **Auth**: GitHub OAuth app; the user's own token is used for all crawling. Single-user design; multi-tenant DB is the documented upgrade path and changes nothing else.
- **Crawl scope**: enumerate the user's repos (owned + pushed-to) via the repos endpoint; walk each repo's commits filtered by author; fetch all authored PRs and issues via the search API (paginate to the beginning). The events stream is NOT used (90-day cap).
- **Sync engine**: background crawl with resumable pagination. Per-repo cursors persist in SQLite; the crawl reads its last cursor on start, resumes exactly where it stopped, and never re-fetches what's already stored. Rate-limit handling: on `remaining: 0` / 429 the crawl parks until the reset time, then continues.
- **Data model**: repos, commits (deduplicated by SHA), PRs, issues. Every record carries its timestamp and its repo; stats are derived queries over these tables.
- **Timeline rendering**: zoom-dependent aggregation. Low zoom levels render density (grouped ticks); high zoom renders individual ticks. Individual ticks are clickable/hoverable with a details popover linking back to GitHub.
- **Honesty**: a single UI line ("GitHub doesn't remember what it deleted") acknowledges that deleted repos are absent from the timeline.
- **Consistent vocabulary** (seed glossary terms for `CONTEXT.md`): timeline, tick, spine (the commit layer), crawl, sync, honesty line.

## Testing Decisions

- One primary seam: the **sync engine**, tested against an injected fake GitHub client and in-memory SQLite. Tests assert external behavior only — never implementation details of the engine internals:
  - A full fake crawl persists every commit, PR, and issue.
  - A crawl interrupted mid-way (fake client fails after N pages) and restarted resumes from the cursor without duplicating or losing records.
  - A fake client reporting rate-limit exhaustion causes the crawl to pause and later continue.
  - Commits deduplicate by SHA.
- Two thin adapters exist but are NOT test seams: the GitHub API client (HTTP → typed responses) and the storage layer (SQLite). The engine tests exercise them through the fake.
- Prior art: none — greenfield repo. Tests are plain, dependency-light; no framework beyond what the toolchain provides.
- The timeline UI has no automated tests; it is verified visually.

## Out of Scope

- Multi-user / shared infrastructure (documented upgrade path only)
- GitHub events stream (push/star/comment events beyond the 90-day API cap)
- Timeline filtering/search UI
- Any historical data not available via the current GitHub API (deleted repos, pre-2011 activity)
- Community or sharing features

## Further Notes

- The crawl-as-eye-candy ("Syncing 2009–2026…") is a first-class experience, not a loading bar: the timeline fills in from the past forward as the crawl progresses.
- Skiper UI free-tier components are recreations of other libraries; where a component doesn't fit the pixel aesthetic or the timeline needs, Tailwind primitives are the fallback.
- Geist Pixel discipline: display-only, min ~12px, aligned to its grid.
- The spec's vocabulary (timeline, tick, spine, crawl, sync, honesty line) should be reused verbatim in tickets, code, and tests.
