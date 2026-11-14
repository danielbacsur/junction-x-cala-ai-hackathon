import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Cabala } from "@/components/cabala/cabala";
import { CABALA_STATES } from "@/components/cabala/states";
import { mocked } from "@/lib/ledger";

export const metadata: Metadata = { title: "Cabala, every state" };

/**
 * Every pose of the one figure on one sheet, for checking it against the film's pose sheet. It is
 * a builder's page: outside the mock it does not exist.
 */
export default function CabalaSheet() {
  if (!mocked()) notFound();

  return (
    <main className="mx-auto w-full max-w-page px-5 py-10">
      <h1 className="text-title">Cabala, every state</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">
        One figure, eight poses. Each is a still first; motion is stepped and stops when the figure is hidden.
      </p>

      <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {CABALA_STATES.map((state) => (
          <li key={state} className="flex flex-col items-center rounded-card bg-paper p-4 shadow-hairline">
            <span className="self-start text-meta font-medium tracking-wide text-ink-3 uppercase">{state}</span>
            <Cabala state={state} size={220} title={`Cabala, ${state}`} />
          </li>
        ))}
      </ul>

      <h2 className="mt-12 text-heading">Sizes</h2>
      <div className="mt-4 flex flex-wrap items-end gap-6">
        {[160, 96, 64].map((size) => (
          <figure key={size} className="text-center text-meta text-ink-3">
            <Cabala state="idle" size={size} />
            <figcaption>{size}px</figcaption>
          </figure>
        ))}
        {[48, 32, 24].map((size) => (
          <figure key={size} className="text-center text-meta text-ink-3">
            <Cabala state="idle" variant="bust" size={size} />
            <figcaption>{size}px bust</figcaption>
          </figure>
        ))}
      </div>

      <h2 className="mt-12 text-heading">Busts, on a card</h2>
      <ul className="mt-4 flex flex-wrap gap-4 rounded-card bg-card p-5 shadow-hairline">
        {CABALA_STATES.map((state) => (
          <li key={state} className="flex items-center gap-2 text-meta text-ink-2">
            <Cabala state={state} variant="bust" size={40} />
            {state}
          </li>
        ))}
      </ul>
    </main>
  );
}
