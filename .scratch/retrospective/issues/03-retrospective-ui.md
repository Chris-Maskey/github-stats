# 03 — Retrospective UI

**What to build:** The user-facing retrospective section on the timeline page. Cached narration renders with its stat block: the opener chapter at top, then one chapter per year. A stale story (fingerprint mismatch) shows a stale marker with a regenerate control — a deliberate click, never automatic. A chapter whose narration failed renders its stat block with a quiet retry affordance. The honesty line stays the single place the app speaks about what GitHub doesn't know; chapter copy never merges with it. Visual style matches the retro-digital design system already in the app.

**Blocked by:** 02 — Narration generation and caching

**Status:** ready-for-agent

- [ ] Retrospective section renders on the timeline page: opener first, then chapters, each showing stat block plus narration
- [ ] Stale story shows a visible stale marker and a regenerate control that triggers a deliberate regeneration
- [ ] Failed-narration chapters render their stat block with a per-chapter retry affordance
- [ ] Fresh cached story renders without hitting the provider
- [ ] Chapters use glossary vocabulary in copy (retrospective, chapter, opener, stat block); honesty line remains separate
- [ ] Verified visually against the design system; no automated UI tests
