"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Polls the sync engine and re-renders the server page when the crawl
// completes, so freshly synced history shows up without a manual reload.
export function SyncRefresh() {
  const router = useRouter();
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch("/api/sync/status");
        const data: { status: string } = await res.json();
        if (data.status === "done" && !doneRef.current) {
          doneRef.current = true;
          router.refresh();
        }
        if (data.status !== "done") doneRef.current = false;
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
