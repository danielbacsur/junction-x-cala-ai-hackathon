import Link from "next/link";
import type { ReactNode } from "react";

/** The wordmark and, beside it, whatever the page needs to say about where it is. */
export function SiteHeader({
  children,
  wide = false,
}: {
  children?: ReactNode;
  wide?: boolean;
}) {
  return (
    <header
      data-print="hide"
      className={`mx-auto flex w-full items-center justify-between gap-4 border-b border-line px-4 py-5 sm:px-6 ${wide ? "max-w-[100rem]" : "max-w-page"}`}
    >
      <Link
        href="/"
        className="flex items-baseline gap-2 rounded-full text-lg font-demi tracking-tight"
      >
        Cabala
        <span className="text-meta font-normal tracking-normal text-ink-3">
          Built with Cala
        </span>
      </Link>
      {children}
    </header>
  );
}
