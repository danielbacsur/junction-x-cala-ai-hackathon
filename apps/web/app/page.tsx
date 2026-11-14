import { Suspense } from "react";

import { Cabala } from "@/components/cabala/cabala";
import { CoverageLine, CoverageSkeleton } from "@/components/hire/coverage";
import { HireFlow } from "@/components/hire/hire-flow";
import { YourMandates } from "@/components/hire/mandates";
import { SiteHeader } from "@/components/ui/site-header";

/** Hire Cabala: who you are, which entity in Cala you are, the brief, and a scope to confirm. */
export default function Hire() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-page flex-1 px-4 pt-10 pb-24 sm:px-6 sm:pt-16">
        <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div>
            <p className="text-meta font-medium tracking-wide text-ink-3 uppercase">Slush 2026 preparation</p>
            <h1 className="mt-3 text-display">Hire Cabala for Slush.</h1>
            <p className="mt-5 max-w-[46ch] text-lede text-ink-2">
              Cabala is a fundraising associate. It reads two to three connections out from your company or fund in Cala&rsquo;s graph and
              brings back the meetings worth taking, each with the sourced trail behind it.
            </p>
          </div>

          {/* The hire card: the one figure, its name and role, and a promise with numbers in it. */}
          <article className="rounded-panel bg-card shadow-hairline">
            <div className="relative flex h-44 items-end justify-center overflow-hidden rounded-t-panel bg-paper-deep/60">
              <Cabala state="waiting" size={210} className="translate-y-11" title="Cabala, hand raised" />
              <span className="absolute right-3 bottom-3 rounded-full bg-card/90 px-3 py-1.5 text-sm font-demi tracking-tight shadow-hairline">
                Cabala <span className="font-normal text-ink-2">· Associate</span>
              </span>
            </div>
            <div className="px-5 pt-4 pb-5">
              <p className="font-demi tracking-tight">
                1 ranked Book, 3 full briefs where the evidence permits, and 1 approved meeting packet.
              </p>
              <p className="mt-1.5 text-sm text-ink-2">&ldquo;I read what sits two connections away, and I say what it does not prove.&rdquo;</p>
            </div>
          </article>
        </div>

        <section aria-label="What the store holds" className="mt-10">
          <Suspense fallback={<CoverageSkeleton />}>
            <CoverageLine />
          </Suspense>
        </section>

        <section aria-labelledby="hire-title" className="mt-10">
          <h2 id="hire-title" className="sr-only">
            Open a mandate
          </h2>
          <HireFlow />
        </section>

        <Suspense>
          <YourMandates />
        </Suspense>

        <p className="mt-16 max-w-[70ch] text-meta text-ink-3">
          Bookrunner prepares meetings. It does not place capital, book meetings or promise an outcome. Cala supplies the facts and the
          connections; Cabala draws a bounded conclusion and says what it does not prove. Being on Cala&rsquo;s Slush list means listed by
          Cala as an attendee, not present in the room.
        </p>
      </main>
    </>
  );
}
