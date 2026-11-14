import Link from "next/link";

import { formatStamp } from "@/lib/format";
import { currentGuest } from "@/lib/guest";
import { getLedger } from "@/lib/ledger";
import { MANDATE_LABEL, STAGE_LABEL } from "@/lib/wording";

/** The mandates this browser has opened. They are tied to its guest cookie and to nothing else. */
export async function YourMandates() {
  const guest = await currentGuest();

  const mandates = guest
    ? await getLedger()
        .listMandates(guest)
        .catch(() => null)
    : [];

  return (
    <section aria-labelledby="mandates-title" className="mt-16">
      <h2 id="mandates-title" className="text-heading">
        Your mandates
      </h2>

      {mandates === null ? (
        <p className="mt-3 text-sm text-ink-2">The ledger is not answering, so your mandates cannot be listed right now.</p>
      ) : mandates.length === 0 ? (
        <p className="mt-3 max-w-[52ch] text-sm text-ink-2">
          None yet. A mandate you open stays with this browser: there is no login, so it cannot be opened from another device.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {mandates.map((mandate) => (
            <li key={mandate.id}>
              <Link
                href={`/m/${mandate.id}`}
                className="flex items-center justify-between gap-4 rounded-card bg-card px-5 py-4 shadow-hairline transition-shadow duration-150 hover:shadow-lift"
              >
                <span className="min-w-0">
                  <span className="block truncate font-demi tracking-tight">{mandate.subject.name}</span>
                  <span className="block text-meta text-ink-3">
                    {MANDATE_LABEL[mandate.role]}, opened {formatStamp(mandate.createdAt)}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-ink-2">{STAGE_LABEL[mandate.stage]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
