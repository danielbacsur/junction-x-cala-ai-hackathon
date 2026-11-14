import { redirect } from "next/navigation";

import { currentGuest } from "@/lib/guest";
import { mocked } from "@/lib/ledger";
import { SCENARIOS, seedScenario, type Scenario } from "@/lib/mock/ledger";

/**
 * A builder's shortcut: opens a mandate frozen at a named moment, so every state of the Desk has
 * an address. It exists only while the app runs on the mock.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/mock/[scenario]">) {
  const { scenario } = await params;
  const guest = await currentGuest();

  if (!mocked() || !guest || !SCENARIOS.includes(scenario as Scenario)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  redirect(`/m/${await seedScenario(guest, scenario as Scenario)}`);
}
