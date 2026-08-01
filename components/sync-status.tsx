"use client";

import { useEffect, useRef, useState } from "react";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import type { SyncProgress } from "@/src/storage";

interface SyncState extends SyncProgress {
  status: string;
  rateLimitResetAt: string | null;
}

// "2009–2026" — the span of activity actually synced so far; the left year
// recedes into the past as the crawl lands older data.
function syncingRange(state: SyncState | null): string | null {
  const min = state?.minAt ? new Date(state.minAt).getFullYear() : null;
  const max = state?.maxAt ? new Date(state.maxAt).getFullYear() : null;
  if (min === null || max === null) return null;
  return `${min}–${max}`;
}

function statusLabel(signedIn: boolean, state: SyncState | null): string {
  if (!signedIn) return "SYNC: AWAITING SIGN-IN";
  const progress = syncingRange(state);
  switch (state?.status) {
    case "running":
      return progress ? `SYNCING ${progress}…` : "SYNCING…";
    case "paused": {
      const resume = state.rateLimitResetAt
        ? ` · RESUME ${new Date(state.rateLimitResetAt).toLocaleTimeString()}`
        : "";
      return `${progress ? `SYNCING ${progress}… · PAUSED` : "PAUSED ON RATE LIMIT"}${resume}`;
    }
    case "done":
      return "SYNC: COMPLETE";
    default:
      return "SYNC: STANDBY";
  }
}

export function SyncStatus({ signedIn }: { signedIn: boolean }) {
  const [state, setState] = useState<SyncState | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch("/api/sync/status");
        const data: SyncState = await res.json();
        if (cancelled) return;
        setState(data);
        if (!started.current && data.status !== "done") {
          started.current = true;
          void fetch("/api/sync/start", { method: "POST" });
        }
      } catch {
        // network blip; the next poll retries
      }
      if (!cancelled) timer = setTimeout(poll, 5000);
    };
    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [signedIn]);

  const running = state?.status === "running";
  const waiting = state?.status === "paused";
  // The loader keeps breathing during a rate-limit park — slower, so the
  // wait reads as waiting rather than as a crawl still making progress.
  // (The running speed is the component's own default.)

  return (
    <span className="inline-flex items-center gap-2.5">
      <DotmSquare3
        size={20}
        dotSize={3}
        boxSize={20}
        animated={running || waiting}
        speed={waiting ? 0.45 : undefined}
        ariaLabel={`Sync engine ${state?.status ?? "standby"}`}
      />
      <span className="font-mono text-xs tracking-widest text-muted-foreground">
        {statusLabel(signedIn, state)}
      </span>
    </span>
  );
}
