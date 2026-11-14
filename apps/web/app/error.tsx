"use client";

import { Cabala } from "@/components/cabala/cabala";
import { Button, ButtonLink } from "@/components/ui/button";
import { SiteHeader } from "@/components/ui/site-header";

/**
 * What a page shows when the ledger behind it fails. Nothing was changed by the failure, and the
 * page says so instead of showing stale or half-read evidence.
 */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col items-center px-4 pt-16 pb-24 text-center sm:px-6">
        <Cabala state="error" size={180} />
        <h1 className="mt-4 text-title">The ledger did not answer.</h1>
        <p className="mt-3 max-w-[50ch] text-ink-2">
          This page could not be read, so nothing is shown rather than something half-read. Nothing was changed. Your mandates and their
          evidence are where you left them.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/" variant="secondary">
            All mandates
          </ButtonLink>
        </div>
        {error.digest && <p className="mt-6 font-mono text-[0.6875rem] text-ink-3">Reference {error.digest}</p>}
      </main>
    </>
  );
}
