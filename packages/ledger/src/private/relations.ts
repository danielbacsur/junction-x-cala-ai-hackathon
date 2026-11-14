import type { RelationFamily } from "../contract";
import type { Evidence, Mention } from "./evidence";
import { FUNDING_WORDING, LEADING, LIMIT, SHARING, TIE_WORDING } from "./language";
import { sentence } from "./words";

/**
 * Finds the relations a sentence states between two named entities and checks each against the
 * evidence. A relation is read from the words between two names ("A invested in B", "A, backed by
 * B", "A's grant from B"), so it is found only where the wording is one of the listed forms.
 */

type Family = "funding" | "award" | "agreement" | "ownership" | "person" | "tie";

type Rule = {
  family: Family;
  /** For funding: which side of the wording provides the money. */
  funder: "left" | "right" | "either";
  pattern: RegExp;
};

function rule(family: Family, funder: Rule["funder"], source: string): Rule {
  return { family, funder, pattern: new RegExp(source) };
}

// What may stand between the relation's words and the second name.
const END = String.raw`\s+(?:both\s+|also\s+|the\s+)?$`;

/** Wordings between two names, tried in order. Passive forms come before the verbs they contain. */
const BETWEEN: Rule[] = [
  rule("funding", "right", String.raw`\b(?:backed|funded|financed|bankrolled|supported)\s+(?:\w+\s+)?by${END}`),
  rule("award", "right", String.raw`\b(?:received|raised|secured|obtained|got|took|accepted|won|closed)\b[^;:]{0,80}\bfrom${END}`),
  rule("funding", "right", String.raw`\b(?:grants?|loans?|funding|investments?|financing|backing|money|capital|round|cheque|check)\s+from${END}`),
  rule("funding", "right", String.raw`\b(?:portfolio compan(?:y|ies)|investees?|grantees?|borrowers?)\s+of${END}`),
  rule("funding", "right", String.raw`\bshar(?:es|ed|e|ing)\b[^;:]{0,40}\b(?:backers?|investors?|funders?)(?:\s+in|[,:])${END}`),
  rule("funding", "left", String.raw`\binvest(?:ed|s|ing)?\s+(?:[^;:]{0,40}\s)?in(?:to)?${END}`),
  rule("funding", "left", String.raw`\b(?:back(?:s|ed|ing)?|fund(?:s|ed|ing)?|financ(?:es|ed|ing)|bankroll(?:s|ed)?|seeded|led|leads|co-led)${END}`),
  rule("funding", "left", String.raw`\b(?:investors?|backers?|funders?|lenders?|shareholders?|financiers?)\s+(?:in|of|behind|to)${END}`),
  rule("award", "left", String.raw`\b(?:granted|grants|lent|lends|loaned|awarded|awards)${END}`),
  rule("funding", "left", String.raw`\b(?:grants?|loans?|investments?|funding|financing|cheque|check|money)\s+(?:to|into|in|for)${END}`),
  rule("award", "either", String.raw`\b(?:awards?|contracts?)\s+(?:to|for)${END}`),
  rule("award", "either", String.raw`\b(?:selected|chose|picked|contracted|commissioned|hired|appointed)${END}`),
  rule("agreement", "either", String.raw`\b(?:contracts?|agreements?|partnerships?|memorand(?:um|a)(?: of understanding)?|mous?|deals?|pilots?|collaborations?|alliances?|joint ventures?)\s+with${END}`),
  rule("agreement", "either", String.raw`\b(?:partner(?:s|ed|ing)?|work(?:s|ed|ing)?|collaborat(?:es|ed|ing)|cooperat(?:es|ed|ing)|teamed up|contract(?:s|ed)?)\s+with${END}`),
  rule("agreement", "either", String.raw`\b(?:customers?|clients?|suppliers?|vendors?|partners?|counterpart(?:y|ies)|contractors?|awardees?)\s+(?:of|to|for|under)${END}`),
  rule("award", "either", String.raw`\b(?:won|wins|secured|landed|signed|inked|struck|was awarded|were awarded|been awarded|selected by|chosen by|contracted by|commissioned by)\b[^;:]{0,80}$`),
  rule("ownership", "either", String.raw`\b(?:subsidiar(?:y|ies)|parent(?: company)?|owners?|affiliates?|holding company)\s+of${END}`),
  rule("ownership", "either", String.raw`\b(?:owns|owned by|controls|controlled by|acquired|acquires|acquired by|bought|bought by|purchased|took over|belongs to)${END}`),
  rule("person", "either", String.raw`\b(?:founded|co-founded|cofounded|(?:co-?)?founders? of|chief executive of|ceo of|cto of|cfo of|chair(?:man|woman|person)? of|board members? of|on the board of|directors? of|partners? at|works? (?:at|for)|employed by|employees? of|joined|heads|runs)${END}`),
  rule("tie", "either", String.raw`\b(?:ties?|tied|connected|linked|related|connection|link)\s+(?:to|with|between)${END}`),
  rule("tie", "either", String.raw`\b(?:through|via)${END}`),
  rule("tie", "either", String.raw`\bshar(?:es|ed|e|ing)\b[^;:]{0,60}\bwith${END}`),
];

const HEAD = String.raw`^'s?\s+(?:[\w.-]+\s+){0,3}?`;
const LISTED = String.raw`(?:\s+(?:include|includes|are|is|was|were))?[,:]?\s+(?:both\s+)?$`;

/** "A's backer B", "A's grant from B": the first name owns the noun, so the whole gap must fit. */
const POSSESSIVE: Rule[] = [
  rule("funding", "right", String.raw`${HEAD}(?:investors?|backers?|funders?|lenders?|shareholders?|financiers?)${LISTED}`),
  rule("award", "right", String.raw`${HEAD}(?:grants?|loans?|funding|investment|round|financing|backing|award|contract)\s+from\s+$`),
  rule("funding", "left", String.raw`${HEAD}(?:investments?|stake|holding|position|grants?|loans?|cheque|check|funding|backing)\s+(?:in|to|into|of|for)\s+$`),
  rule("funding", "left", String.raw`${HEAD}(?:portfolio compan(?:y|ies)|investees?|grantees?|portfolio)${LISTED}`),
  rule("agreement", "either", String.raw`${HEAD}(?:contracts?|agreements?|partnerships?|memorandum of understanding|mous?|deals?|pilots?|collaborations?|alliances?)\s+with\s+$`),
  rule("agreement", "either", String.raw`${HEAD}(?:customers?|clients?|suppliers?|partners?|counterpart(?:y|ies)|contractors?)${LISTED}`),
  rule("ownership", "either", String.raw`${HEAD}(?:subsidiar(?:y|ies)|parent(?: company)?|owners?|affiliates?|unit|arm)${LISTED}`),
  rule("person", "either", String.raw`${HEAD}(?:(?:co-?)?founders?|ceo|chief executive|cto|cfo|chair(?:man|woman)?|directors?|board members?|employees?)${LISTED}`),
];

/** "The investors in A include B": the relation's words come before the first name. */
const BEFORE: Rule[] = [
  rule("funding", "right", String.raw`\b(?:investors?|backers?|funders?|lenders?|shareholders?)\s+(?:in|of|behind)\s+$`),
  rule("agreement", "either", String.raw`\b(?:customers?|clients?|partners?|suppliers?|counterpart(?:y|ies))\s+(?:of|to)\s+$`),
  rule("ownership", "either", String.raw`\b(?:subsidiar(?:y|ies)|parent|owners?)\s+of\s+$`),
  rule("person", "either", String.raw`\b(?:(?:co-?)?founders?|chief executive|ceo|board members?)\s+of\s+$`),
];

/** "A and B are partners", "A and B signed an agreement": the relation's words come after both names. */
const AFTER = rule(
  "agreement",
  "either",
  String.raw`^\s+(?:(?:are|were|became|remain|have been)\s+(?:\w+\s+)?partners\b|(?:have\s+|has\s+)?(?:signed|entered|announced|agreed|concluded|struck|hold|have)\b[^;:]{0,60}\b(?:agreements?|contracts?|partnerships?|memorand(?:um|a)|mous?|deals?|pilots?|collaborations?)\b|(?:work|partner|collaborate|cooperate)(?:ed|s)?\s+together\b)`,
);

const COPULA = /^\s*(?:(?:is|are|was|were|include|includes|included)\s+(?:both\s+)?|:\s*)$/;
const LIST = /^\s*(?:,?\s*and|,?\s*or|&|,?\s*as well as|,?\s*and also|,?\s*plus)\s+(?:both\s+)?$/;
const ALONGSIDE = /^\s*,?\s*(?:alongside|together with|along with|with)\s+$/;

// After these the subject may be an earlier name: "A backs B and is funded by C".
const WIDE = /^\s*,|\b(?:and|but|while|whereas)\b/;

const NOUNS: Record<Family, RelationFamily[]> = {
  funding: ["investment"],
  award: ["agreement", "investment"],
  agreement: ["agreement"],
  ownership: ["ownership"],
  person: ["person"],
  tie: ["investment", "agreement", "ownership", "person"],
};

const WORDS: Record<Family, string> = {
  funding: "funding",
  award: "an award or funding",
  agreement: "an agreement",
  ownership: "an ownership relation",
  person: "a person or a role",
  tie: "a connection",
};

type Claim = {
  left: Mention[];
  /** True when the subject may be any of the names on the left, false when it is all of them. */
  any: boolean;
  right: Mention;
  rule: Rule;
};

type Verdict = "supported" | "undirected" | "opposite" | "none";

function judge(left: Mention, right: Mention, { family, funder }: Rule, evidence: Evidence): Verdict {
  const links = evidence.links(left.ids, right.ids);

  if (family === "tie") {
    return links.length > 0 || evidence.onOneTrail([left.ids, right.ids]) ? "supported" : "none";
  }

  if (links.some((link) => link.family !== "investment" && NOUNS[family].includes(link.family))) return "supported";
  if (!NOUNS[family].includes("investment")) return "none";

  const ties = links.filter((link) => link.family === "investment");
  const wanted = funder === "left" ? left.ids : funder === "right" ? right.ids : [...left.ids, ...right.ids];

  if (ties.some((tie) => tie.funder !== null && wanted.includes(tie.funder))) return "supported";
  if (ties.some((tie) => tie.funder === null)) return "undirected";

  return ties.length > 0 ? "opposite" : "none";
}

function undirectedReason(...parties: [string, string]) {
  const [a, b] = parties.sort();

  return `The evidence shows an investment tie between ${a} and ${b} without settling who funded whom, so it cannot be worded as funding.`;
}

function explain(verdict: Verdict, left: Mention, right: Mention, { family }: Rule, evidence: Evidence): string {
  if (verdict === "undirected") return undirectedReason(left.name, right.name);

  if (verdict === "opposite") {
    return `The evidence shows the funding between ${left.name} and ${right.name} running the other way.`;
  }

  const reason = `The evidence does not show ${WORDS[family]} between ${left.name} and ${right.name}.`;

  // Saying who the evidence does link each party to shows where the claim went wrong.
  const records = [left, right].flatMap((party, index) => {
    const other = index === 0 ? right : left;
    const linked = NOUNS[family].flatMap((noun) => evidence.linkedTo(party.ids, noun));
    const others = [...new Set(linked)].filter((name) => name !== other.name).slice(0, 3);

    return others.length > 0 ? [`${party.name} with ${others.join(", ")}`] : [];
  });

  return records.length > 0 ? `${reason} ${sentence(`It records ${records.join(", and ")}`)}` : reason;
}

function readClaims(lower: string, mentions: Mention[]): Claim[] {
  const claims: Claim[] = [];

  // The names the current relation started from, and the relation itself while a list continues.
  let subjects: Mention[] = [];
  let open: Pick<Claim, "left" | "any" | "rule"> | null = null;

  mentions.forEach((mention, index) => {
    if (index === 0) {
      subjects = [mention];

      return;
    }

    const previous = mentions[index - 1];
    const gap = lower.slice(previous.end, mention.start);
    // The words before the first of the two names, back to the start of its clause.
    const lead = lower.slice(index > 1 ? mentions[index - 2].end : 0, previous.start).split(/[;:]/).at(-1)!;
    const found = gap.startsWith("'")
      ? POSSESSIVE.find((candidate) => candidate.pattern.test(gap))
      : gap.length <= 120
        ? BETWEEN.find((candidate) => candidate.pattern.test(gap))
        : undefined;

    if (found) {
      // A denial states no relation: "does not show that A funded B", "A has not invested in B".
      if (LIMIT.test(gap) || LIMIT.test(lead.slice(-60))) {
        subjects = [mention];
        open = null;

        return;
      }

      const any = WIDE.test(gap);

      open = { left: any ? mentions.slice(0, index) : subjects, any, rule: found };
      claims.push({ ...open, right: mention });
      subjects = [mention];
    } else if (LIST.test(gap)) {
      // "A backs B and C": C stands where B stands. "A and B back C": both are subjects.
      if (open) claims.push({ ...open, right: mention });

      subjects = [...subjects, mention];
    } else if (ALONGSIDE.test(gap) && open) {
      // "A invested in B alongside C": C did what A did. "A is backed by B alongside C": what B did.
      if (open.rule.funder === "left") claims.push({ left: [mention], any: false, right: previous, rule: open.rule });
      if (open.rule.funder === "right") claims.push({ ...open, right: mention });
    } else {
      const before = !open && COPULA.test(gap) ? BEFORE.find((candidate) => candidate.pattern.test(lead)) : undefined;

      if (before && !LIMIT.test(lead.slice(-60))) {
        open = { left: [previous], any: false, rule: before };
        claims.push({ ...open, right: mention });
      } else {
        open = null;
      }

      subjects = [mention];
    }
  });

  const tail = mentions.length > 0 ? lower.slice(mentions.at(-1)!.end) : "";

  if (subjects.length > 1 && AFTER.pattern.test(tail) && !LIMIT.test(tail)) {
    subjects.forEach((left, index) => {
      for (const right of subjects.slice(index + 1)) claims.push({ left: [left], any: false, right, rule: AFTER });
    });
  }

  return claims;
}

/** Why the relations a sentence states are not in the evidence. Empty when they all are. */
export function checkRelations(lower: string, mentions: Mention[], hedged: boolean, evidence: Evidence): string[] {
  // A clearly hedged sentence offers a relation as a reading, which the second read weighs.
  if (hedged || mentions.length < 2) return [];

  const reasons = new Set<string>();

  for (const claim of readClaims(lower, mentions)) {
    const subjects = claim.left.filter((left) => !left.ids.some((id) => claim.right.ids.includes(id)));

    if (subjects.length === 0) continue;

    const verdicts = subjects.map((left) => judge(left, claim.right, claim.rule, evidence));

    if (claim.any) {
      if (verdicts.includes("supported")) continue;

      // Explain the reading that came closest; among equals, the nearest name.
      const closest = (["undirected", "opposite", "none"] as const)
        .map((verdict) => verdicts.lastIndexOf(verdict))
        .find((index) => index >= 0)!;

      reasons.add(explain(verdicts[closest], subjects[closest], claim.right, claim.rule, evidence));
    } else {
      subjects.forEach((left, index) => {
        if (verdicts[index] !== "supported") {
          reasons.add(explain(verdicts[index], left, claim.right, claim.rule, evidence));
        }
      });
    }
  }

  const named = (id: string) => mentions.some((mention) => mention.ids.includes(id));

  if (FUNDING_WORDING.test(lower) && !TIE_WORDING.test(lower) && !LIMIT.test(lower)) {
    for (const [a, b] of evidence.undirected) {
      if (named(a) && named(b)) reasons.add(undirectedReason(evidence.name(a), evidence.name(b)));
    }
  }

  const groups = [...new Map(mentions.map((mention) => [mention.ids.join("|"), mention])).values()];

  if (SHARING.test(lower) && groups.length >= 2 && !LIMIT.test(lower) && !connected(groups, evidence)) {
    reasons.add(`The evidence holds no trail that connects ${groups.map((group) => group.name).join(", ")}.`);
  }

  if (LEADING.test(lower) && !LIMIT.test(lower)) {
    const led = groups.some((a) => groups.some((b) => evidence.links(a.ids, b.ids).some((link) => link.lead)));

    if (!led) reasons.add("The evidence does not establish who led a round.");
  }

  return [...reasons];
}

/** True when the named entities lie on one trail, or the evidence links them into one group. */
function connected(groups: Mention[], evidence: Evidence) {
  if (evidence.onOneTrail(groups.map((group) => group.ids))) return true;

  const reached = new Set([0]);
  const queue = [0];

  while (queue.length > 0) {
    const current = queue.pop()!;

    groups.forEach((group, index) => {
      if (!reached.has(index) && evidence.links(groups[current].ids, group.ids).length > 0) {
        reached.add(index);
        queue.push(index);
      }
    });
  }

  return reached.size === groups.length;
}
