import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb, getStorage } from "@/lib/db";
import { sessionToken } from "@/lib/session";
import { normalizeEvents } from "@/lib/timeline";
import { computeStats } from "@/lib/stats";
import { computeYearStatBlocks } from "@/lib/year-stats";
import { Timeline } from "@/components/timeline";
import { StatsSection } from "@/components/stats-section";
import { RetrospectiveSection } from "@/components/retrospective-section";
import { SyncStatus } from "@/components/sync-status";
import { SyncRefresh } from "@/components/sync-refresh";
import { StartSyncButton } from "@/components/start-sync";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";

export default async function TimelinePage() {
  const token = await sessionToken();
  const user = token ? getDb().userBySession(token) : null;
  if (!user) redirect("/");

  const storage = getStorage();
  const events = normalizeEvents(storage.listCommits(), storage.listPRs(), storage.listIssues());

  return (
    <main className="flex min-h-screen flex-col gap-8 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl leading-none tracking-wide">GITHUB HISTORY TIMELINE</h1>
          <p className="mt-2 font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
            {events.length} EVENTS · {events[0] ? new Date(events[0].at).getFullYear() : "—"} →{" "}
            {events.at(-1) ? new Date(events.at(-1)!.at).getFullYear() : "—"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <SyncStatus signedIn />
          <Link
            href="/"
            className="rounded-sm border border-border px-4 py-2 font-mono text-xs tracking-widest hover:bg-secondary"
          >
            ← HOME
          </Link>
        </div>
      </header>

      <SyncRefresh />

      {events.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          <DotmSquare3 size={40} dotSize={4} boxSize={28} ariaLabel="Waiting for synced history" />
          <p className="font-heading text-lg tracking-widest">NO HISTORY YET</p>
          <p className="max-w-sm text-center font-mono text-[11px] leading-relaxed tracking-widest text-muted-foreground">
            The crawl fills the timeline from your first commit to today — it resumes from where it stopped.
          </p>
          <StartSyncButton />
        </div>
      ) : (
        <>
          <StatsSection stats={computeStats(events, storage.listRepos())} />
          <RetrospectiveSection blocks={computeYearStatBlocks(events)} />
          {/* eslint-disable-next-line react-hooks/purity -- RSC: a per-request "today" snapshot is intended */}
          <Timeline events={events} now={Date.now()} />
        </>
      )}

      <footer className="mt-auto flex flex-col items-center gap-1.5 pt-4">
        <p className="font-mono text-[11px] tracking-[0.3em] text-muted-foreground/70">
          GITHUB DOESN&apos;T REMEMBER WHAT IT DELETED
        </p>
      </footer>
    </main>
  );
}
