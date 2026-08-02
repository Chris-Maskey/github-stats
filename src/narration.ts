import { createHash } from 'node:crypto'
import type { TimelineEvent } from '../lib/timeline.ts'
import { formatDay } from '../lib/timeline.ts'
import { computeYearStatBlocks, type YearStatBlock } from '../lib/year-stats.ts'
import type { Storage } from './storage.ts'
import type { Narrator, Retrospective } from './types.ts'

// One retry per failed chapter, then stat-block-only — the spec's cost
// guardrail; never loop on a throwing narrator.
const MAX_ATTEMPTS = 2

const RULES = `ASSERTION RULES — follow strictly:
- Assert only facts given in the stats above. Never invent numbers, dates, repos, or events.
- You get ordering and phrasing only; never numbers you were not handed.
- Never infer mood, motive, or cause over gaps in the data.
- Keep it short: a few sentences.`

/** Stable hash over the serialized stat blocks plus user identity. */
export function fingerprintFor(blocks: YearStatBlock[], userId: number): string {
  return createHash('sha256').update(`${userId}\n${JSON.stringify(blocks)}`).digest('hex')
}

function isEmpty(block: YearStatBlock): boolean {
  return block.commits + block.prs + block.issues === 0
}

function chapterPrompt(block: YearStatBlock): string {
  const titles = block.sampledTitles.map((t) => `  - ${t.repo}: "${t.title}"`).join('\n')
  return `You are writing one chapter of a GitHub history retrospective. The chapter covers the calendar year ${block.year}. Narrate the developer's year from the stats below.
STATS FOR ${block.year}:
- commits: ${block.commits}
- pull requests: ${block.prs}
- issues: ${block.issues}
- top repo: ${block.topRepo ?? 'none'}
- longest streak (days): ${block.longestStreakDays}
- first activity: ${block.firstAt === null ? 'none' : formatDay(block.firstAt)}
- last activity: ${block.lastAt === null ? 'none' : formatDay(block.lastAt)}
- sampled titles:
${titles}
${RULES}`
}

function openerPrompt(blocks: YearStatBlock[]): string {
  const total = (pick: (b: YearStatBlock) => number) => blocks.reduce((sum, b) => sum + pick(b), 0)
  const first = blocks[0]
  const last = blocks.at(-1)!
  const perYear = blocks
    .map(
      (b) =>
        `- ${b.year}: ${b.commits} commits, ${b.prs} pull requests, ${b.issues} issues, top repo ${b.topRepo ?? 'none'}, longest streak ${b.longestStreakDays} days`,
    )
    .join('\n')
  return `You are writing the opener of a GitHub history retrospective: a short career-spanning throughline. It must agree with every chapter, so assert only what appears here.
LIFETIME TOTALS:
- span: ${first.year} → ${last.year}
- total commits: ${total((b) => b.commits)}
- total pull requests: ${total((b) => b.prs)}
- total issues: ${total((b) => b.issues)}
- first activity: ${first.firstAt === null ? 'none' : formatDay(first.firstAt)}
- last activity: ${last.lastAt === null ? 'none' : formatDay(last.lastAt)}
CHAPTER STATS:
${perYear}
${RULES}`
}

async function narrateWithRetry(narrator: Narrator, prompt: string): Promise<string | null> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      return await narrator(prompt)
    } catch {
      // retry once, then the chapter is stat-block-only
    }
  }
  return null
}

export interface RetrospectiveOptions {
  events: TimelineEvent[]
  userId: number
  storage: Storage
}

export interface GenerateOptions extends RetrospectiveOptions {
  narrator: Narrator
  /** Explicit regeneration request: regenerate even when the cache is fresh. */
  force?: boolean
}

function fingerprintForEvents(events: TimelineEvent[], userId: number): string {
  return fingerprintFor(computeYearStatBlocks(events), userId)
}

/** Read the cached retrospective and whether its fingerprint still matches the data. Zero provider calls. */
export function loadRetrospective(opts: RetrospectiveOptions): { retrospective: Retrospective | null; stale: boolean } {
  const fp = fingerprintForEvents(opts.events, opts.userId)
  const cached = opts.storage.getRetrospective(opts.userId)
  if (!cached) return { retrospective: null, stale: false }
  return { retrospective: cached.retrospective, stale: cached.fingerprint !== fp }
}

/**
 * Generate (or serve from cache) the whole retrospective: one narrator call
 * per active year in order, then the opener last. Empty years are never sent.
 * A failed chapter stays stat-block-only and never aborts the story, which
 * still caches. Generation happens only when this is called — never on read.
 */
export async function generateRetrospective(opts: GenerateOptions): Promise<Retrospective> {
  const blocks = computeYearStatBlocks(opts.events)
  const fp = fingerprintFor(blocks, opts.userId)
  const cached = opts.storage.getRetrospective(opts.userId)
  if (!opts.force && cached && cached.fingerprint === fp) return cached.retrospective

  const retrospective: Retrospective = { opener: null, chapters: [] }
  for (const block of blocks) {
    const narration = isEmpty(block) ? null : await narrateWithRetry(opts.narrator, chapterPrompt(block))
    retrospective.chapters.push({ year: block.year, narration })
  }
  if (blocks.length > 0) retrospective.opener = await narrateWithRetry(opts.narrator, openerPrompt(blocks))
  opts.storage.saveRetrospective(opts.userId, fp, retrospective)
  return retrospective
}
