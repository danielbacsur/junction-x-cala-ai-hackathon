import { Suspense } from "react";
import { BriefFlow } from "@/components/hire/brief-flow";
import { YourMandates } from "@/components/hire/mandates";
import { SiteHeader } from "@/components/ui/site-header";
import { Cabala } from "@/components/cabala/cabala";
export default function Home() {
  return <><SiteHeader /><main className="mx-auto w-full max-w-page flex-1 px-5 py-16 sm:px-8 sm:py-24">
    <div className="mb-12 flex items-center gap-8">
      <div><p className="text-meta text-ink-3">Built with Cala · Slush 2026</p>
        <h1 className="mt-4 text-display">Your next meeting<br />starts with a connection.</h1>
        <p className="mt-5 max-w-xl text-lede text-ink-2">Brief Cabala in a sentence. Get a few names, the evidence behind each, and a packet when you’re ready.</p>
      </div><div className="hidden sm:block"><Cabala state="waiting" size={180} /></div>
    </div>
    <BriefFlow /><Suspense><YourMandates /></Suspense>
    <p className="mt-20 max-w-xl text-meta text-ink-3">Cabala prepares fundraising meetings. Cala supplies the records; each recommendation shows the connections and what they leave unknown.</p>
  </main></>;
}
