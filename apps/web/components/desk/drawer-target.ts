import type { EntityRef, Hop, Signal, SourceRef } from "@fundraising/package-ledger";

/** What the source drawer can be opened on. */
export type DrawerTarget =
  | { kind: "entity"; entity: EntityRef }
  | { kind: "hop"; hop: Hop }
  | { kind: "signal"; signal: Signal }
  | { kind: "sources"; title: string; sources: readonly SourceRef[] };

export type OpenDrawer = (target: DrawerTarget) => void;
