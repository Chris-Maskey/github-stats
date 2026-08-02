# 01 — Year stat blocks render as chapters

**What to build:** The deterministic spine of the retrospective, with no LLM in the loop. From the synced history, a stat block per UTC calendar year is computed (counts by kind, top repo, longest streak, first/last activity, ~5–10 sampled titles chosen deterministically — peak-commit day, most-active repo, first and last), and the timeline page renders one chapter per year showing its stat block. Years with no synced activity render as a deliberate, moodless "no activity synced" chapter. Empty history renders the existing empty state, no chapters. A chapter is renderable with a stat block alone — narration, when it arrives, is garnish on top of this.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Stat block computation is pure and deterministic over normalized events + repos (same input shape as the existing stats module), grouped by UTC calendar year
- [ ] Sampled titles are chosen deterministically per the spec rules and include commit and PR titles only
- [ ] Timeline page renders one chapter per year of activity, stat block first, in chronological order
- [ ] Empty years render as the deliberate blank chapter, never generated text or a mood
- [ ] Empty synced history renders the existing empty state with no chapters
- [ ] Unit tests cover determinism, year bucketing in UTC, sampled-title selection, and empty-year handling (pure-function style)
- [ ] ADR docs/adr/0001-retrospective-narration-contract.md and the CONTEXT.md glossary additions are committed
