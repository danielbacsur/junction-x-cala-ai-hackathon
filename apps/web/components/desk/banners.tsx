import type { Coverage } from "@fundraising/package-ledger";
import type { ReactNode } from "react";

import { formatStamp } from "@/lib/format";
import { ago, isStale } from "@/lib/wording";

function Banner({ tone, children }: { tone: "trouble" | "note"; children: ReactNode }) {
  return (
    <p role="status" className={`rounded-2xl px-4 py-3 text-sm ${tone === "trouble" ? "bg-orange-tint" : "bg-yellow-tint"}`}>
      {children}
    </p>
  );
}

/**
 * What stands between the customer and fresh evidence, said in words: Cala refusing requests,
 * evidence that has gone stale, or a Desk that could not refresh itself.
 */
export function DeskBanners({ coverage, now, unreachable }: { coverage: Coverage; now: number; unreachable: boolean }) {
  const from = formatStamp(coverage.newestFetchAt) ?? "an unknown time";
  const stale = isStale(coverage.newestFetchAt, now);

  return (
    <>
      {coverage.cala === "latched" && (
        <Banner tone="trouble">
          <strong className="font-demi">Cala is not answering.</strong> Showing stored evidence from {from}
          {stale && coverage.newestFetchAt ? `, ${ago(coverage.newestFetchAt, now)}` : ""}. Queued reads stay queued and nothing new is
          promised until Cala answers again.
        </Banner>
      )}

      {coverage.cala !== "latched" && stale && coverage.newestFetchAt && (
        <Banner tone="note">
          <strong className="font-demi">Stale evidence.</strong> The newest read in the store is from {from}, {ago(coverage.newestFetchAt, now)}.
          Ask Cabala to read again before you rely on a recent date.
        </Banner>
      )}

      {unreachable && (
        <Banner tone="trouble">
          <strong className="font-demi">This page could not refresh.</strong> What you see is the last read of the ledger. It will try
          again by itself.
        </Banner>
      )}
    </>
  );
}
