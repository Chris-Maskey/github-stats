# Spec: Retrospective

Status: ready-for-agent
Feature: retrospective

## Problem Statement

The timeline shows the user their entire synced history as a picture, but a picture of decades of dots is not a story. A user who has synced ten years of commits, PRs, and issues has no way to get a narrated sense of that history — what the years contained, what the throughline was. Handing that raw history to a free-wheeling LLM produces confident wrong autobiography: fabricated moods, motives, and causes invented over the gaps. Worse than a boring right answer.

## Solution

The Retrospective: an LLM-narrated story of the synced history, rendered on the timeline page. One opener plus one chapter per calendar year of activity. The narrator never sees the raw history — only a deterministic per-year stat block (counts, top repo, streaks, ~5–10 sampled titles). Every sentence it writes must trace to a stat it was handed; it gets ordering and phrasing only, never numbers it wasn't given (the assertion rule). Years with no synced activity render as a deliberate, moodless "no activity synced" chapter. A chapter whose narration failed still renders its stat block — data is truth, narration is garnish.

The output is cached in SQLite keyed on a stats fingerprint. A changed fingerprint flags the story as stale; regeneration is a deliberate click, never automatic (it costs money, and the crawl-complete moment is the least stable data moment). The opener is generated last — after every chapter has landed — so its cross-year claims can never contradict them. The provider seam is a single `(prompt) → text` call, currently hardcoded to the Gemini 2.5 Flash free tier (~1,500 req/day, no card); a provider swap is a one-file change by design. The free-tier training caveat is moot because every sent token is public GitHub content.

## User Stories

1. As a user, I want a Retrospective section on the timeline page, so that my synced history reads as a story, not just dots.
2. As a user, I want one opener chapter at the top, so that I get the career-spanning throughline before the per-year chapters.
3. As a user, I want one chapter per calendar year of activity, so that I can scan the story year by year.
4. As a user, I want every chapter to show its stat block, so that the deterministic numbers are visible regardless of narration success.
5. As a user, I want sampled titles (peak-commit day, most-active repo, first and last) inside the stat block, so that the narration can name real moments without seeing the whole history.
6. As a user, I want the narration to assert only what the stat block handed it, so that I never read invented facts about my own history.
7. As a user, I want years with no synced activity to render as a deliberate, moodless "no activity synced" chapter, so that holes are stated plainly rather than filled with fake emotion.
8. As a user, I want the honesty line to remain the single place the app speaks about what GitHub doesn't know, so that chapter copy never merges with the deleted-repos caveat.
9. As a user, I want a chapter whose narration failed to still render its stat block, so that a generation error never hides my real data.
10. As a user, I want the opener generated last, so that its cross-year claims can never contradict the chapters.
11. As a user, I want the generated story cached in SQLite, so that revisiting the page doesn't re-pay for generation.
12. As a user, I want the cache keyed on a stats fingerprint, so that a changed history flags the story as stale automatically.
13. As a user, I want regeneration to be a deliberate click, never automatic, so that I control when money is spent on generation.
14. As a user, I want a visible indication when the cached story is stale, so that I know the narration may not match the latest sync.
15. As a user, I want the retry/regenerate action to work per-story, so that I don't have to regenerate healthy chapters to fix one.
16. As a user, I want the opener to be short by design, so that there is no decade of runway for narration to wander.
17. As a user, I want generation to be one call per chapter plus one for the opener, so that cost stays predictable and the free tier isn't blown.
18. As a user, I want the provider to be swappable in one file, so that a future provider change doesn't ripple through the app.
19. As a user, I want the Retrospective to respect the crawl: regenerating after a completed crawl, so that the story reflects the full synced history.
20. As a user, I want to see the Retrospective even while the crawl is still in progress, so that early chapters arrive as history lands.
21. As a user, I want an empty story (no synced history at all) to render as nothing or a quiet placeholder, never a generated lie.
22. As a user, I want the stat block computation to be deterministic, so that the same history always yields the same story (cached or regenerated).
23. As a user, I want the year window to be calendar years in UTC, so that chapters line up with the timeline's year boundaries.
24. As a user, I want no telemetry of my tokens leaving the generation path beyond the public commit/PR titles already in the stat blocks, so that private signal isn't added to the prompt.

## Implementation Decisions

- **Stat blocks**: a pure, deterministic function over the normalized events + repos (same input shape as `computeStats`), grouping by UTC calendar year. Each block carries: counts by kind, top repo, longest streak in that year, first/last activity timestamps, and ~5–10 sampled titles chosen deterministically (peak-commit day, most-active repo, first and last commits/PRs, then filler from the year's event list). Only these blocks — never raw events or commit bodies beyond the sampled titles — are handed to the narrator.
- **Fingerprint**: a stable hash (e.g. SHA-256) over the serialized stat blocks plus the user's identity. Stored alongside the cached story; any change to the synced data changes the fingerprint and flags the story stale.
- **Cache**: SQLite, via the existing storage layer (new table keyed on the fingerprint; `sync_state`-style key/value is insufficient because it must hold the story text and the fingerprint it was generated from). Reads are per-page; generation is one deliberate action.
- **Generation orchestration**: a single module owning the loop — build stat blocks, check fingerprint against cache, generate each missing chapter (one `(prompt) → text` call per chapter) in year order, then the opener, persist story + fingerprint. A per-chapter failure does not abort the story: the chapter persists as stat-block-only and the page renders it without narration. Empty years are not sent to the narrator at all — the blank chapter is a render-time constant, not generated text.
- **Prompt construction**: the prompt for a chapter is the stat block formatted as plain text plus a fixed instruction set (assertion rule, tone). The prompt for the opener is lifetime totals plus the throughline across the already-generated chapters' stat blocks — it is built last, after all chapters have landed.
- **Provider seam**: one `(prompt) → text` async function; the Gemini implementation (2.5 Flash, free tier) is the only file that knows the provider. Tests never call it — they inject a fake, exactly as the sync engine injects a fake GitHub client.
- **UI**: a Retrospective section mounted on the timeline page below the stats section. Chapters render stat block + narration; a stale story shows a stale marker with a regenerate control; a failed-narration chapter shows stat block plus a quiet retry affordance. Empty history renders nothing but the page's existing empty state.
- **Vocabulary**: use the glossary terms (retrospective, chapter, opener, stat block, sampled titles, assertion rule) in code identifiers and UI copy per CONTEXT.md. The ADR (docs/adr/0001-retrospective-narration-contract.md) is the controlling contract; where this spec and the ADR disagree, the ADR wins.
- **Honesty**: chapter copy never merges with the honesty line. The honesty line stays the single place the app speaks about what GitHub doesn't know.

## Testing Decisions

- **One primary test seam: the generation orchestrator**, with an injected fake narrator (the `(prompt) → text` seam) and in-memory SQLite — mirroring how the sync engine is tested against a fake GitHub client (test/engine.test.ts). Tests assert external behavior only:
  - Given N years of stat blocks, exactly N+1 calls occur (N chapters, then the opener last).
  - Every prompt passed to the fake contains only content derivable from the stat blocks — never raw events or commit bodies outside the sampled titles (assertion rule, checked by inspecting prompt text).
  - A fake narrator that throws leaves that chapter's stat block rendered and the story still cached.
  - A second run with an unchanged fingerprint performs zero narrator calls (cache hit).
  - A changed fingerprint (new event inserted) causes the story to be flagged stale and regeneration to refetch.
  - Years with no activity produce no narrator call and a render-time blank chapter.
- **Pure function tests**: year stat-block computation is unit-tested directly, same style as test/stats.test.ts (node:test, plain asserts) — determinism, year bucketing in UTC, sampled-title selection rules, empty-year handling.
- **Thin adapters, NOT test seams**: the Gemini provider (HTTP → text) and the SQLite narration cache — exercised through the orchestrator tests only, like the GitHub client and storage layer in the sync engine tests.
- **Prior art**: test/engine.test.ts (fake-injection pattern), test/stats.test.ts (pure-function pattern). No new test framework.
- The Retrospective UI has no automated tests; it is verified visually, like the timeline.

## Out of Scope

- Multi-provider selection UI (the seam exists; swapping is a code change, not a setting).
- Regeneration of a single chapter in isolation from the UI (per-chapter retry is in scope as an affordance; internals stay whole-story).
- Any narration over data the local DB doesn't contain (e.g. asking the model about GitHub-side knowledge).
- Automating regeneration after crawl completion — regeneration stays a deliberate click per ADR.
- The free-tier training caveat is moot by ADR (all sent tokens are public GitHub content); no privacy work beyond keeping the prompt stats-only.
- Export/share of the retrospective.

## Further Notes

- The ADR (docs/adr/0001-retrospective-narration-contract.md) and the CONTEXT.md glossary additions are written but uncommitted — commit them alongside the first implementation commit of this feature.
- Cost guardrail: the free tier (~1,500 req/day) is ample for one story; the per-chapter call structure keeps worst case at one call per year + one opener. Never loop on retries — one retry per failed chapter at most, then render stat-block-only.
- The opener being generated last is a hard ordering constraint, not a nicety: its cross-year claims are only safe because every chapter already exists when it is built.
