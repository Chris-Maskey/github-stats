# 06 — Sync experience

**What to build:** The crawl-as-eye-candy. While the crawl runs, the timeline fills in from the past forward with progress surfacing ("Syncing 2009–2026…") behind a Dot Matrix loader — the wait becomes part of the experience, not a loading bar. The experience respects rate-limit pauses (the fill stops, the loader indicates waiting) and completes with the full picture.

**Blocked by:** 04 — Crawl wired into the app, 05 — Timeline page

**Status:** ready-for-agent

- [ ] During a crawl, the timeline fills in from the past forward as data lands
- [ ] Progress copy ("Syncing 2009–2026…") reflects real crawl state
- [ ] Dot Matrix loader shown during crawl and during rate-limit pauses
- [ ] On completion the fill gives way to the full timeline without a jarring reload
