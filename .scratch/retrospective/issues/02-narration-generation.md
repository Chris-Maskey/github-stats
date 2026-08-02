# 02 — Narration generation and caching

**What to build:** The generation engine behind the retrospective. A stats fingerprint is computed over the serialized stat blocks; generated narration is cached in SQLite keyed on that fingerprint. The orchestrator builds a prompt from each chapter's stat block plus the assertion-rule instruction set, calls the single `(prompt) → text` provider seam once per chapter in year order, then once more for the opener (last, after every chapter has landed, from lifetime totals and the already-landed stat blocks), and persists the story with its fingerprint. Empty years are never sent to the narrator. A per-chapter failure leaves that chapter stat-block-only and does not abort the story. A changed fingerprint flags the story stale; regeneration happens only through an explicit request — never automatically. The provider seam is one file, hardcoded to Gemini 2.5 Flash free tier. Exposed through a generation request route so a deliberate click can trigger it.

**Blocked by:** 01 — Year stat blocks render as chapters

**Status:** ready-for-agent

- [ ] Fingerprint is a stable hash over serialized stat blocks plus user identity; any data change changes it
- [ ] Story + fingerprint persist to SQLite; a cache hit with an unchanged fingerprint performs zero provider calls
- [ ] Exactly one provider call per year of activity plus one for the opener, opener strictly last
- [ ] Every prompt contains only content derivable from stat blocks — never raw history or commit bodies beyond the sampled titles (assertion rule)
- [ ] A throwing provider leaves that chapter stat-block-only and the story still caches
- [ ] Empty years produce no provider calls and no cached narration
- [ ] Changed fingerprint flags the story stale; regeneration is an explicit request only
- [ ] Orchestrator tests inject a fake narrator against in-memory storage (engine-style); provider is a thin adapter, not a test seam
