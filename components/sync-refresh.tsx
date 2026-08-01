"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { SyncProgress } from "@/src/storage";

type SyncStatus = SyncProgress & { status: string };

// Polls the sync engine and re-renders the server page whenever the synced
// picture changes, so the timeline fills in from the past forward as the
// crawl lands data — and the last chunk arrives with the "done" flip, no
// jump to a suddenly-complete picture.
export function SyncRefresh() {
  const router = useRouter();
  const last = useRef({ status: "", minAt: "", maxAt: "" });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch("/api/sync/status");
        const data: SyncStatus = await res.json();
        const now = { status: data.status, minAt: data.minAt ?? "", maxAt: data.maxAt ?? "" };
        const changed =
          now.status !== last.current.status ||
          now.minAt !== last.current.minAt ||
          now.maxAt !== last.current.maxAt;
        last.current = now;
        if (changed && now.status !== "idle") router.refresh();
      } catch {
        // network blip; the next poll retries
      }
      if (!cancelled) timer = setTimeout(poll, 3000);
    };
    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [router]);

  return null;
}
