import { Suspense } from "react";
import { notFound } from "next/navigation";
import { currentGuest } from "@/lib/guest";
import { loadDesk } from "@/lib/desk";
import { Room } from "@/components/desk/room";
export default function MandatePage({ params }: PageProps<"/m/[id]">) {
  return <Suspense fallback={<p className="p-8" role="status">Opening your mandate…</p>}><Load params={params} /></Suspense>;
}
async function Load({ params }: Pick<PageProps<"/m/[id]">, "params">) {
  const { id } = await params; const owner = await currentGuest();
  const snapshot = owner ? await loadDesk(id, owner) : null;
  if (!snapshot) notFound();
  return <Room initial={snapshot} />;
}
