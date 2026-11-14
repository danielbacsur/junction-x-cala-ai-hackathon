/**
 * What kind of money one party put into a round, as far as the stored record says. A grant
 * (which covers a subsidy) and a loan are non-dilutive; equity, and anything the record leaves
 * open, are not.
 */
export type MoneyKind = "grant" | "loan" | "equity" | "unknown";

type Round = { instrument: string | null; name: string | null };

/**
 * Reads Cala's instrument values (GRANT, LOAN_FACILITY, PREFERRED_EQUITY) and its round names
 * ("Grant", "Debt Financing", "Seed", "Series A") alike. Equity is looked for first, so a
 * convertible loan is never read as a loan.
 */
function read(text: string): MoneyKind {
  const words = text.toLowerCase().replace(/[^a-z0-9]+/g, " ");

  if (/\b(equity|convertible|safe|seed|series|angel|ipo|pipe)\b/.test(words)) return "equity";
  if (/\b(grants?|subsid(y|ies))\b/.test(words)) return "grant";
  if (/\b(loans?|debt)\b/.test(words)) return "loan";

  return "unknown";
}

/**
 * A round's own kind: its instrument when the round has been read, and what its stored name says
 * when it has not. An instrument we cannot read stays unknown, whatever the name.
 */
export function roundKind(round: Round): MoneyKind {
  return read(round.instrument ?? round.name ?? "");
}

/**
 * What one financier put into a round. Cala records a company's investors on its grant and loan
 * rounds too, so the party's own role comes first: a GRANTOR granted and a LENDER lent, unless
 * the round itself is equity, in which case the record disagrees with itself and settles
 * nothing. An INVESTOR takes the round's kind, except beside a named grantor or lender, where
 * the grant or loan is theirs and what the investor put in is not said.
 */
export function partyKind(role: string, round: Round, grantorOrLenderNamed: boolean): MoneyKind {
  const kind = roundKind(round);

  if (role === "GRANTOR" || role === "LENDER") return kind === "equity" ? "unknown" : role === "GRANTOR" ? "grant" : "loan";
  if (kind === "grant" || kind === "loan") return grantorOrLenderNamed ? "unknown" : kind;

  return kind;
}

/** True when any of the money is a grant or a loan. Equity and unknown money never count. */
export function nonDilutive(kinds: Iterable<MoneyKind>): boolean {
  for (const kind of kinds) if (kind === "grant" || kind === "loan") return true;

  return false;
}
