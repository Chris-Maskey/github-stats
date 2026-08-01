# GitHub History Timeline

A single-user web app that crawls a user's entire GitHub history (commits, PRs, issues) into SQLite and renders it as one continuous, zoomable timeline from their first activity to today.

## Language

**Timeline**:
The continuous picture of a user's entire GitHub history, rendered as a zoomable strip from first activity to today.
_Avoid_: History view, activity feed

**Tick**:
A single rendered activity marker on the timeline — one commit, PR, or issue — visually distinct by kind, hoverable for details.
_Avoid_: Dot, marker

**Spine**:
The commit layer of the timeline; the continuous "backbone" that PRs and issues weave into.

**Crawl**:
The background process that fetches the user's history from GitHub and stores it locally. It pauses on rate-limit exhaustion, resumes where it stopped, and is never duplicated.
_Avoid_: Sync, fetch, scrape

**Sync**:
The user-facing state of a crawl in progress — "Syncing 2009–2026…" — the visible, fill-in-from-the-past experience of the crawl.

**Honesty line**:
The one-line acknowledgement that deleted repos leave holes in the history that GitHub itself can't fill.

## Language under construction

**Retrospective**:
The LLM-narrated story of the synced history: an opener plus one chapter per year. Every sentence traces to a provided stat; the narrator gets ordering and phrasing only, never numbers it wasn't handed.
_Avoid_: Recap, yearbook, AI summary

**Chapter**:
One bounded per-year block of the retrospective: a stat block plus narration covering exactly one calendar year. An empty chapter renders as a deliberate blank — "no activity synced" — never as a mood.
_Avoid_: Year card, section

**Opener**:
The career-spanning chapter at the top of the retrospective: lifetime totals and the throughline. It is short by design — no decade of runway for narration to wander.
_Avoid_: Prologue, summary

**Stat block**:
The deterministic per-year numbers — counts, top repo, streaks, sampled titles — computed server-side and handed to the narrator as the only source of numbers.
_Avoid_: Stats, data

**Sampled titles**:
The ~5–10 commit/PR titles chosen deterministically per year (peak-commit day, most-active repo, first and last) and included in the stat block, so narration can name real moments without seeing the whole history.
_Avoid_: Quotes, examples

**Assertion rule**:
Narration may assert only what the local DB knows — a fact, a count, a title it was handed. It may never infer mood, motive, or cause over gaps. The honesty line is the single place the app speaks about what GitHub doesn't know, and it never merges with chapter copy.

Terms resolved during the current design session live here until they settle; then they graduate to the main glossary.
