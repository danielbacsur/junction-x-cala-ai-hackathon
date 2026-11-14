import { Cabala } from "@/components/cabala/cabala";
import { ButtonLink } from "@/components/ui/button";
import { SiteHeader } from "@/components/ui/site-header";

/** Also what another guest's mandate looks like: it is not said to exist. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col items-center px-4 pt-16 pb-24 text-center sm:px-6">
        <Cabala state="thinking" size={180} />
        <h1 className="mt-4 text-title">Nothing here that is yours.</h1>
        <p className="mt-3 max-w-[48ch] text-ink-2">
          A mandate opens only in the browser that hired Cabala for it. If this link came from another device or another person, it will
          not open here.
        </p>
        <ButtonLink href="/" className="mt-6">
          Hire Cabala
        </ButtonLink>
      </main>
    </>
  );
}
