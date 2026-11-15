import { Suspense } from "react";
import Link from "next/link";

import { BriefFlow } from "@/components/hire/brief-flow";
import { CoverageLine, CoverageSkeleton } from "@/components/hire/coverage";
import { YourMandates } from "@/components/hire/mandates";
import { SiteHeader } from "@/components/ui/site-header";
import { Cabala } from "@/components/cabala/cabala";

export default function Home() {
  return (
    <>
      <SiteHeader>
        <Link
          href="#mandates-title"
          className="text-sm text-ink-2 hover:text-ink"
        >
          Your mandates ↗
        </Link>
      </SiteHeader>
      <main className="mx-auto w-full max-w-page flex-1 px-4 pt-9 pb-10 sm:px-6 sm:pt-12">
        <div className="mb-7 flex items-center justify-between border-b border-line pb-4">
          <p className="text-sm font-medium">Fundraising workspace</p>
          <span className="rounded-full bg-card px-3 py-1.5 text-xs text-ink-2">
            Slush 2026
          </span>
        </div>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] lg:gap-14">
          <section className="pt-2 lg:pt-5">
            <p className="text-meta text-ink-3">
              A clear brief. A better next meeting.
            </p>
            <h1 className="mt-3 max-w-md text-[2.25rem] leading-[1.1] tracking-[-0.04em] sm:text-[2.75rem]">
              Find the connection.
              <br />
              Start the conversation.
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-ink-2">
              Your fundraising agent, from the first shortlist to a prepared
              meeting. Tell Cabala what you’re working towards.
            </p>
            <ol className="mt-7 hidden space-y-5 sm:block">
              {[
                [
                  "A focused shortlist",
                  "Three names to start, ranked for your mandate.",
                ],
                [
                  "Evidence you can follow",
                  "Investment, ownership and agreement connections, with sources.",
                ],
                [
                  "A meeting worth preparing for",
                  "Questions, an agenda and an outreach draft when you choose a name.",
                ],
              ].map(([title, description], index) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-card text-xs text-ink-3">
                    0{index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-demi">{title}</p>
                    <p className="mt-1 max-w-sm text-meta leading-relaxed text-ink-3">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section
            aria-label="Brief your fundraising agent"
            className="overflow-hidden rounded-panel bg-card shadow-lift"
          >
            <div className="flex justify-center bg-paper-deep/60 py-3">
              <Cabala state="waiting" size={220} title="Cabala waving hello" />
            </div>
            <div className="flex items-center gap-3 border-b border-line px-6 py-4">
              <div>
                <h2 className="text-sm font-demi">Start with Cabala</h2>
                <p className="mt-0.5 text-xs text-ink-3">
                  Your fundraising agent · Built with Cala
                </p>
              </div>
              <span className="ml-auto rounded-full bg-paper px-2.5 py-1 text-[0.6875rem] text-ink-2">
                New mandate
              </span>
            </div>
            <div className="p-5 sm:p-6">
              <BriefFlow />
            </div>
          </section>
        </div>
        <Suspense>
          <YourMandates />
        </Suspense>
        <section
          className="mt-8 rounded-card bg-card/60 p-5 sm:p-6"
          aria-label="Research coverage"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-demi">Your research foundation</h2>
            <span className="text-xs text-ink-3">
              From the shared evidence store
            </span>
          </div>
          <Suspense fallback={<CoverageSkeleton />}>
            <CoverageLine />
          </Suspense>
        </section>
        <footer className="mt-7 flex flex-wrap justify-between gap-3 text-xs text-ink-3">
          <p>Sourced connections. Clear limits. Your decision.</p>
          <p>Cabala prepares meetings; it does not promise introductions.</p>
        </footer>
      </main>
    </>
  );
}
