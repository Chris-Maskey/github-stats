"use client";

import { useState } from "react";

// Kicks off the crawl from the timeline page itself; SyncRefresh (mounted on
// the same page) picks up the "done" status and refreshes the data.
export function StartSyncButton() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void fetch("/api/sync/start", { method: "POST" }).catch(() => setBusy(false));
      }}
      className="rounded-sm bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
    >
      {busy ? "SYNCING…" : "START SYNC"}
    </button>
  );
}
