"use client";

import { useEffect, useRef, useState } from "react";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";

interface SyncState {
  status: string;
  rateLimitResetAt: string | null;
}

function statusLabel(signedIn: boolean, state: SyncState | null): string {
  if (!signedIn) return "SYNC: AWAITING SIGN-IN";
  switch (state?.status) {
    case "running":
      return "SYNC: RUNNING";
    case "paused":
      return state.rateLimitResetAt
        ? `SYNC: PAUSED ON RATE LIMIT · RESUME ${new Date(state.rateLimitResetAt).toLocaleTimeString()}`
        : "SYNC: PAUSED ON RATE LIMIT";
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

  return (
    <span className="inline-flex items-center gap-2.5">
      <DotmSquare3
        size={20}
        dotSize={3}
        boxSize={20}
        animated={running}
        ariaLabel={`Sync engine ${state?.status ?? "standby"}`}
      />
      <span className="font-mono text-xs tracking-widest text-muted-foreground">
        {statusLabel(signedIn, state)}
      </span>
    </span>
  );
}
