import { TAKEN } from "./text";

/**
 * The wordings a packet may never use (consensus point 16.6), and the words that make a sentence
 * a hedge, a limit or a request. Each list is short on purpose: a phrase is here because it makes
 * the claim, not because it is near one.
 */

const HEDGE =
  /\b(?:might|could|possibly|perhaps|probably|likely|plausibl[ey]|potentially|presumably|apparently|appears?|seems?|suggests?|suggesting|indicat(?:es|ing)|hints?|infer(?:red|s)?|inference|our reading|we read|in our view|we think|we believe|unverified|unconfirmed|to be confirmed|worth asking|reason to ask|hypothesis|assum(?:e|es|ing|ption))\b/i;

/** True for a sentence that is clearly offered as a reading and not as a fact. */
export function isHedged(sentence: string) {
  // "may" hedges; "May 2025" is a month.
  return HEDGE.test(sentence) || /\bmay\b(?!\s+\d)/.test(sentence);
}

/** Words that deny a claim or state its limits: "does not prove", "unknown", "whether". */
export const LIMIT = /\b(?:not|no|never|cannot|neither|nor|unknown|unclear|unsettled|whether|without)\b|n't\b/i;

const ASKING =
  /\b(?:ask|asks|asking|request|requesting|whether|would you|could you|can you|grateful|appreciate|welcome|hoping|hope)\b|\bif (?:you|they|he|she) (?:would|could|can|might)\b/;

const FIRST_PERSON =
  /\b(?:i|we)(?:'d|'ll| would| will| can| could| want to| wanted to| am happy to| are happy to)?(?: like to| love to)?\s*$/;

const INTRODUCED = String.raw`(?:you|us|we|me|them|the founders?|the team|the company|your team|your company|${TAKEN}(?:'s \w+)?)`;

const INTRODUCTION = [
  new RegExp(String.raw`\bintroduc(?:e|es|ing|ed)\s+${INTRODUCED}\s+to\b`),
  /\b(?:make|makes|making|made|arrange|arranges|arranged|broker|brokers|brokered|provide|provides|offer|offers|offered|give|gives|get|gets|secure|secures|facilitate|facilitates)\s+(?:you |us )?(?:an?|the|that|this|your)\s+(?:warm |direct |personal )?intro(?:duction)?s?\b/,
  /\b(?:warm|guaranteed|promised|ready-made)\s+intro(?:duction)?s?\b/,
  /\bintro(?:duction)?s?\s+(?:through|via|from|by|courtesy of)\b/,
  /\bput\s+(?:you|us)\s+in\s+touch\b/,
  /\bopen(?:s|ed)?\s+(?:the\s+|a\s+)?doors?\b/,
  /\bvouch(?:es|ed)?\s+for\b/,
];

/**
 * An introduction promised or assumed. Asking for one is fine, and so is the writer introducing
 * themselves; a hedge is not, because a trail never supports "can introduce you".
 */
export function promisesIntroduction(lower: string): string | null {
  for (const pattern of INTRODUCTION) {
    const match = lower.match(pattern);

    if (!match) continue;

    const before = lower.slice(0, match.index);

    if (ASKING.test(lower) || LIMIT.test(before) || FIRST_PERSON.test(before)) continue;

    return "A trail is a sourced connection, not an introduction, so the packet cannot promise or assume one.";
  }

  return null;
}

const SELF = /\b(?:i|we|you)\s*$/;

const APPETITE = [
  /\bappetite\b/,
  /\b(?:is|are|remains?)\s+(?:actively\s+|currently\s+|clearly\s+|very\s+|highly\s+|now\s+)?(?:interested|keen|eager|looking|ready|willing|open|excited|committed|hungry|poised)\s+(?:in|to|for|about)\b/,
  /\b(?:wants?|intends?|plans?|aims?|expects?|is set|are set|is going|are going|is looking|are looking)\s+to\s+(?:invest|fund|back|lead|co-invest|join|commit|write|participate|finance|deploy)\b/,
  /\bwill\s+(?:\w+\s+)?(?:invest|fund|back|lead|co-invest|join the round|commit|write (?:a|the) che(?:que|ck)|participate|finance)\b/,
  /\b(?:actively|currently)\s+(?:investing|invests|funding|funds|backing|backs|seeking|deploying)\b/,
];

/** What a party wants or will do, stated as fact. The customer speaking of themselves is exempt. */
export function assertsAppetite(lower: string): string | null {
  for (const pattern of APPETITE) {
    const match = lower.match(pattern);

    if (!match || SELF.test(lower.slice(0, match.index))) continue;

    return "Past activity is a reason to ask, not proof of appetite, so the packet cannot state what a party wants or will do.";
  }

  return null;
}

const CAUSATION =
  /\b(?:led|leading|leads) to\b|\bresult(?:ed|s|ing)? in\b|\bas a result\b|\bcaus(?:ed|es|ing)\b|\bthanks to\b|\b(?:which|that) is why\b|\bpav(?:ed|es|ing) the way\b|\bmade possible by\b|\btrigger(?:ed|s)\b/;

export function claimsCausation(lower: string): string | null {
  return CAUSATION.test(lower)
    ? "The evidence shows what happened, not why, so the packet cannot say that one event caused another."
    : null;
}

/** Words that state a relation, which makes a sentence one of fact. */
export const RELATION_WORDS =
  /\b(?:invest\w*|fund(?:ed|s|ing|er|ers)|back(?:ed|s|ing|er|ers)|financ\w+|grant(?:s|ed|or)?|loan(?:s|ed)?|lent|raised|portfolio|shareholders?|contracts?|agreements?|partner\w*|mou|memorandum|customers?|clients?|suppliers?|subsidiar\w+|parent company|owns|owned|acquired|founded|founders?|co-founders?|ceo|board|won|awarded|signed)\b/;

/** Words that word a tie as funding. "Investment" alone does not: "an investment tie" is a tie. */
export const FUNDING_WORDING =
  /\binvest(?:ed|s|ing|or|ors)\b|\bfund(?:ed|s|ing|er|ers)\b|\bback(?:ed|s|ing|er|ers)\b|\bfinanc(?:ed|es|ing|ier|iers)\b|\bportfolio compan(?:y|ies)\b|\bshareholders?\b|\bgrant(?:ed|or)\b|\blent\b|\bloaned\b|\b(?:money|capital) from\b|\braised\b/;

/** Words that say a tie's direction is open. */
export const TIE_WORDING = /\bties?\b|\btied\b|\bundirected\b|\bdirection\b|\bwho funded whom\b/;

export const SHARING =
  /\bshar(?:e|es|ed|ing)\b|\bin common\b|\bmutual\b|\b(?:common|same) (?:backer|investor|funder|counterparty|partner|owner)s?\b/;

export const LEADING =
  /\blead investor\b|\bco-led\b|\bco-lead\b|\bled by\b|\bled\s+(?:\S+\s+){0,3}?(?:round|financing|seed|series)\b|\bleads?\s+(?:\S+\s+){0,3}?(?:round|financing)\b/;

/** Words that present a date as the date of a report and not of the event. */
export const REPORTING =
  /\b(?:report(?:ed|s)?|publish(?:ed)?|sources?|article|press|coverage|filing|filed|register(?:ed)?|record(?:ed|s)?|dated|according to|as of|listed)\b/;

/**
 * A relation's verb straight after a sentence's first word, which makes that word the party that
 * acts: "Sequoia backs …", "Atomico is an investor in …".
 */
export const ACTS =
  /^\s+(?:(?:also|has|have|had|is|was|recently|previously|now|already)\s+){0,2}(?:invest(?:s|ed)|back(?:s|ed)|fund(?:s|ed)|financ(?:es|ed)|grant(?:s|ed)|award(?:s|ed)|led|co-led|lent|acquir(?:es|ed)|owns|bought|founded|co-founded|partner(?:s|ed)|signed|won|(?:an?\s+|the\s+)?(?:investor|backer|funder|lender|shareholder|partner|customer|supplier|subsidiary|parent|owner|founder))\b/;

/** First words that act without naming anyone. A plural ("Investors back …") names no one either. */
export const UNNAMED =
  /^(?:it|they|this|that|these|those|he|she|we|you|both|each|all|some|one|neither|either|who|which|nobody|everyone|nothing|someone|there|what)$|s$/;
