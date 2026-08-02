import type { ReactNode } from "react";
import type { Stats } from "@/lib/stats";
import { formatDay } from "@/lib/timeline";

export function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-card p-3">
      <div>{children}</div>
      <div className="mt-2 font-mono text-[10px] tracking-[0.3em] text-muted-foreground">{label}</div>
    </div>
  );
}

export function BigNumber({ value }: { value: number | string }) {
  return <span className="font-heading text-2xl leading-none tracking-wide">{value}</span>;
}

export function StatsSection({ stats }: { stats: Stats }) {
  const topLanguages = stats.languages.slice(0, 4);
  const hiddenLanguages = stats.languages.length - topLanguages.length;
  return (
    <section className="rounded-sm border border-border bg-card p-4">
      <h2 className="font-heading text-xs tracking-widest text-muted-foreground">THE NUMBERS</h2>
      <div className="mt-3 grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        <Tile label="COMMITS">
          <BigNumber value={stats.commits} />
        </Tile>
        <Tile label="PULL REQUESTS">
          <BigNumber value={stats.prs} />
        </Tile>
        <Tile label="ISSUES">
          <BigNumber value={stats.issues} />
        </Tile>
        <Tile label="REPOS">
          <BigNumber value={stats.repos} />
        </Tile>
        <Tile label="LONGEST STREAK (DAYS)">
          <BigNumber value={stats.longestStreakDays} />
        </Tile>
        <Tile label="FIRST ACTIVITY">
          <BigNumber value={stats.firstAt === null ? "—" : formatDay(stats.firstAt)} />
        </Tile>
        <Tile label="LAST ACTIVITY">
          <BigNumber value={stats.lastAt === null ? "—" : formatDay(stats.lastAt)} />
        </Tile>
        <Tile label="TOP LANGUAGES">
          {topLanguages.length === 0 ? (
            <BigNumber value="—" />
          ) : (
            <ul className="space-y-1 font-mono text-xs tracking-widest">
              {topLanguages.map((l) => (
                <li key={l.language ?? ""} className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{l.language ?? "—"}</span>
                  <span className="text-muted-foreground">{l.count}</span>
                </li>
              ))}
              {hiddenLanguages > 0 && (
                <li className="text-[10px] tracking-[0.3em] text-muted-foreground">+{hiddenLanguages} MORE</li>
              )}
            </ul>
          )}
        </Tile>
      </div>
    </section>
  );
}
