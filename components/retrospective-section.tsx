import type { YearStatBlock } from "@/lib/year-stats";
import { formatDay } from "@/lib/timeline";
import { BigNumber, Tile } from "@/components/stats-section";

const isEmpty = (b: YearStatBlock) => b.commits + b.prs + b.issues === 0;

/** The deterministic spine of the retrospective: one chapter per calendar year. */
export function RetrospectiveSection({ blocks }: { blocks: YearStatBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <section className="rounded-sm border border-border bg-card p-4">
      <h2 className="font-heading text-xs tracking-widest text-muted-foreground">RETROSPECTIVE</h2>
      <div className="mt-4 space-y-6">
        {blocks.map((block) => (
          <Chapter key={block.year} block={block} />
        ))}
      </div>
    </section>
  );
}

function Chapter({ block }: { block: YearStatBlock }) {
  return (
    <article>
      <h3 className="font-heading text-sm tracking-widest">{block.year}</h3>
      <div className="mt-2">{isEmpty(block) ? <BlankChapter /> : <ChapterStatBlock block={block} />}</div>
    </article>
  );
}

/** A deliberate, moodless blank for years with no synced activity. */
function BlankChapter() {
  return (
    <div className="border border-dashed border-border px-3 py-6 text-center">
      <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">NO ACTIVITY SYNCED</p>
    </div>
  );
}

function ChapterStatBlock({ block }: { block: YearStatBlock }) {
  return (
    <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
      <Tile label="COMMITS">
        <BigNumber value={block.commits} />
      </Tile>
      <Tile label="PULL REQUESTS">
        <BigNumber value={block.prs} />
      </Tile>
      <Tile label="ISSUES">
        <BigNumber value={block.issues} />
      </Tile>
      <Tile label="TOP REPO">
        <span className="font-mono text-xs tracking-widest">{block.topRepo ?? "—"}</span>
      </Tile>
      <Tile label="LONGEST STREAK (DAYS)">
        <BigNumber value={block.longestStreakDays} />
      </Tile>
      <Tile label="FIRST ACTIVITY">
        <BigNumber value={block.firstAt === null ? "—" : formatDay(block.firstAt)} />
      </Tile>
      <Tile label="LAST ACTIVITY">
        <BigNumber value={block.lastAt === null ? "—" : formatDay(block.lastAt)} />
      </Tile>
      <Tile label="SAMPLED TITLES">
        {block.sampledTitles.length === 0 ? (
          <BigNumber value="—" />
        ) : (
          <ul className="space-y-1 font-mono text-[10px] tracking-widest">
            {block.sampledTitles.map((t) => (
              <li key={t.id} className="truncate">
                <span className="text-muted-foreground">{t.repo}:</span> {t.title}
              </li>
            ))}
          </ul>
        )}
      </Tile>
    </div>
  );
}
