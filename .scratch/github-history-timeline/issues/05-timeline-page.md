# 05 — Timeline page

**What to build:** The centerpiece. A continuous, zoomable timeline from the synced history — commits, PRs, and issues as visually distinct ticks on one strip, from the user's first activity to today. Zoom from decade-scale (aggregated density) down to day-scale (individual ticks). Hover/click a tick for its details (message/title, repo, date, link to GitHub). The honesty line ("GitHub doesn't remember what it deleted") is visible once.

**Blocked by:** 02 — Sync engine core, 03 — Design system foundation, 04 — Crawl wired into the app

**Status:** ready-for-agent

- [ ] Timeline renders all synced history from the DB, first activity to today
- [ ] Ticks distinguish commits vs PRs vs issues visually
- [ ] Zooming from decade to day scale works; low zoom aggregates instead of rendering walls of ticks
- [ ] Clicking/hovering a tick shows details with a link to GitHub
- [ ] Honesty line about deleted repos visible
- [ ] Rendered in the design system (Geist Pixel display, Skiper UI, Animate UI icons)
