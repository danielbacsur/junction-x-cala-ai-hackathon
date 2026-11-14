/**
 * Reading prose for the things that can be checked: sentences, amounts, dates and counts. All of
 * it is plain pattern matching, so the same text always reads the same way.
 */

/** Makes text comparable: plain spaces, hyphens and quotes, and no accents. */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[   -​  　]/g, " ")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export type Piece = {
  text: string;
  /** The whitespace that followed the sentence, kept so paragraphs survive a removal. */
  gap: string;
};

const ABBREVIATIONS = new Set("vs approx mr mrs ms dr prof st est ca cf".split(" "));
const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function endsSentence(text: string, at: number, next: string | undefined) {
  if (next === undefined) return true;
  if (text[at] !== ".") return true;
  if (/\p{Ll}/u.test(next)) return false;

  const before = text.slice(0, at);
  const word = (before.match(/([\p{L}.]+)$/u)?.[1] ?? "").toLowerCase();

  // A round's letter is a single letter that does end sentences: "… its Series A."
  if (/\bseries \p{L}$/iu.test(before)) return true;

  // "Dr.", "Nov.", an initial such as "J." and dotted forms such as "U.S." do not end a sentence.
  return !(ABBREVIATIONS.has(word) || MONTH_NAMES.includes(word) || /^(?:\p{L}\.)*\p{L}$/u.test(word));
}

/** Splits prose into sentences. Every line break also ends one, so list lines stand alone. */
export function splitSentences(text: string): Piece[] {
  const pieces: Piece[] = [];
  let start = 0;

  function push(end: number, gap: string) {
    const piece = text.slice(start, end).trim();

    if (piece) pieces.push({ text: piece, gap });
    else if (pieces.length > 0) pieces[pieces.length - 1].gap += gap;
  }

  for (const match of text.matchAll(/([.!?]+["')\]]*)(\s+)|(\s*\n\s*)/g)) {
    const [whole, mark, space, lineBreak] = match;
    const end = match.index + (mark?.length ?? 0);

    if (lineBreak === undefined && !space.includes("\n")) {
      // A list number such as "1." belongs to the line it starts.
      if (/^\d{1,2}$/.test(text.slice(start, match.index).trim())) continue;
      if (!endsSentence(text, match.index, text[match.index + whole.length])) continue;
    }

    push(end, lineBreak ?? space);
    start = match.index + whole.length;
  }

  push(text.length, "");

  return pieces;
}

/** Puts the kept sentences back together, with a paragraph break wherever one was. */
export function joinSentences(pieces: Piece[], keep: boolean[]): string {
  let text = "";
  let gap = "";

  pieces.forEach((piece, index) => {
    if (keep[index]) {
      text += (text ? gap : "") + piece.text;
      gap = piece.gap;
    } else if (piece.gap.includes("\n") && !gap.includes("\n")) {
      gap = piece.gap;
    }
  });

  return text;
}

const FILL = "\u0001";

/** A stretch of text that a reader has taken; it reads as a blank to the next reader. */
export const TAKEN = `${FILL}+`;

/** Text being read for checkable tokens. What one reader takes is blanked for the next one. */
export class Scan {
  constructor(public text: string) {}

  /** Blanks every match, unless the reader returns false to leave it. */
  take(pattern: RegExp, read: (match: RegExpMatchArray) => boolean | void): void {
    let out = "";
    let last = 0;

    for (const match of this.text.matchAll(pattern)) {
      if (read(match) === false) continue;

      out += this.text.slice(last, match.index) + FILL.repeat(match[0].length);
      last = match.index + match[0].length;
    }

    this.text = out + this.text.slice(last);
  }

  blank(start: number, end: number) {
    this.text = this.text.slice(0, start) + FILL.repeat(end - start) + this.text.slice(end);
  }
}

// Amounts

export type Amount = {
  value: number;
  /** The place value of the last digit written: 14.4 million is stated to the nearest 100,000. */
  step: number;
  currency: string | null;
  raw: string;
  /** Where it stands in the text it was read from. */
  start: number;
  end: number;
};

const NUMBER = String.raw`\d{1,3}(?:[, ]\d{3})+(?:\.\d+)?|\d{1,3}(?:\.\d{3}){2,}(?:,\d+)?|\d+(?:[.,]\d+)?`;
const CODES = "USD|EUR|GBP|NOK|SEK|DKK|CHF|JPY|CAD|AUD|ISK|PLN|CZK|CNY|INR|KRW|SGD";
const SCALE = String.raw`(?:\s?(thousand|million|billion|trillion)\b|(k|mn|m|bn|b)(?![\p{L}\d]))`;
const UNIT_WORDS = String.raw`euros?\b|dollars?\b|pounds?\b|yen\b|kronor\b|kroner\b`;

const CURRENCIES: Record<string, string | null> = {
  $: "USD",
  us$: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  euro: "EUR",
  euros: "EUR",
  dollar: "USD",
  dollars: "USD",
  pound: "GBP",
  pounds: "GBP",
  yen: "JPY",
  kronor: "SEK",
  // Norwegian or Danish; the word alone does not say which.
  kroner: null,
};

const SCALES: Record<string, number> = {
  thousand: 1e3,
  k: 1e3,
  million: 1e6,
  mn: 1e6,
  m: 1e6,
  billion: 1e9,
  bn: 1e9,
  b: 1e9,
  trillion: 1e12,
};

const PREFIXED = new RegExp(String.raw`(?<![\p{L}\d])(US\$|[$€£¥]|(?:${CODES})\b)\s?(${NUMBER})${SCALE}?`, "giu");

const SUFFIXED = new RegExp(
  String.raw`(?<![\p{L}\d.,])(${NUMBER})${SCALE}?\s?((?:${CODES})\b|${UNIT_WORDS}|[$€£])`,
  "giu",
);

const SCALED = new RegExp(String.raw`(?<![\p{L}\d.,])(${NUMBER})\s?(thousand|million|billion|trillion)\b`, "giu");

function parseNumber(raw: string) {
  let digits = raw.replace(/ /g, "");

  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(digits)) digits = digits.replace(/,/g, "");
  else if (/^\d{1,3}(\.\d{3}){2,}(,\d+)?$/.test(digits)) digits = digits.replace(/\./g, "").replace(",", ".");
  else digits = digits.replace(",", ".");

  const [whole, fraction = ""] = digits.split(".");
  const decimals = fraction.replace(/0+$/, "").length;
  const zeros = decimals > 0 ? 0 : (whole.match(/0+$/)?.[0].length ?? 0);

  return { value: Number(digits), step: decimals > 0 ? 10 ** -decimals : 10 ** Math.min(zeros, whole.length - 1) };
}

function amount(
  match: RegExpMatchArray,
  number: string,
  scale: string | undefined,
  currency: string | undefined,
): Amount {
  const parsed = parseNumber(number);
  const factor = scale ? SCALES[scale.toLowerCase()] : 1;
  const unit = currency?.toLowerCase();

  return {
    value: parsed.value * factor,
    step: parsed.step * factor,
    currency: unit === undefined ? null : unit in CURRENCIES ? CURRENCIES[unit] : unit.toUpperCase(),
    raw: match[0].trim(),
    start: match.index!,
    end: match.index! + match[0].length,
  };
}

/** Money and scaled figures: "$476 million", "NOK 14,376,817", "5 million euros", "2 million". */
export function takeAmounts(scan: Scan): Amount[] {
  const found: Amount[] = [];

  scan.take(PREFIXED, (match) => void found.push(amount(match, match[2], match[3] ?? match[4], match[1])));
  scan.take(SUFFIXED, (match) => void found.push(amount(match, match[1], match[2] ?? match[3], match[4])));
  scan.take(SCALED, (match) => void found.push(amount(match, match[1], match[2], undefined)));

  return found;
}

/** True when a stated figure is the supported one, correctly rounded and never more than 5% off. */
export function sameValue(stated: Amount, supported: number) {
  const difference = Math.abs(stated.value - supported);

  return difference <= stated.step / 2 + 1e-9 && difference <= Math.abs(supported) * 0.05 + 1e-9;
}

// Dates

export type DateParts = { year: number; month: number | null; day: number | null };
export type DateMention = DateParts & { raw: string };

const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const ORDINAL = "(?:st|nd|rd|th)?";

const ISO_DATE = /(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+Z?)?(?!\d)/g;
const DAY_MONTH_YEAR = new RegExp(String.raw`\b(\d{1,2})${ORDINAL}(?: of)? (${MONTH})\.?,? (\d{4})\b`, "gi");
const MONTH_DAY_YEAR = new RegExp(String.raw`\b(${MONTH})\.? (\d{1,2})${ORDINAL},? (\d{4})\b`, "gi");
const DOTTED = /(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/g;
const MONTH_YEAR = new RegExp(String.raw`\b(${MONTH})\.?,? (\d{4})\b`, "gi");
const ISO_MONTH = /(?<![\d-])(\d{4})-(\d{2})(?![\d-])/g;
const YEAR = /(?<![\p{L}\d.,/])(19[5-9]\d|20[0-4]\d)(?!\d|[.,/]\d)/gu;
const EVENT_NAME = /\bslush\s+(?:20\d\d|'\d\d)\b/gi;

function monthNumber(word: string) {
  return MONTH_NAMES.indexOf(word.slice(0, 3).toLowerCase()) + 1;
}

/** Dates written out in full or to the month. Bare years are read later, after the amounts. */
export function takeDates(scan: Scan): DateMention[] {
  const found: DateMention[] = [];

  function add(raw: string, year: string, month: number | null, day: string | null) {
    found.push({ raw: raw.trim(), year: Number(year), month, day: day === null ? null : Number(day) });
  }

  scan.take(ISO_DATE, (match) => add(match[0], match[1], Number(match[2]), match[3]));
  scan.take(DAY_MONTH_YEAR, (match) => add(match[0], match[3], monthNumber(match[2]), match[1]));
  scan.take(MONTH_DAY_YEAR, (match) => add(match[0], match[3], monthNumber(match[1]), match[2]));
  scan.take(DOTTED, (match) => add(match[0], match[3], Number(match[2]), match[1]));
  scan.take(MONTH_YEAR, (match) => add(match[0], match[2], monthNumber(match[1]), null));
  scan.take(ISO_MONTH, (match) => add(match[0], match[1], Number(match[2]), null));

  return found;
}

/** Bare years such as "2025" or "mid-2026". "Slush 2026" is the event's name, not a date. */
export function takeYears(scan: Scan): DateMention[] {
  const found: DateMention[] = [];

  scan.take(EVENT_NAME, () => {});
  scan.take(YEAR, (match) => void found.push({ raw: match[0], year: Number(match[1]), month: null, day: null }));

  return found;
}

/** Reads a stored ISO date at whatever precision it has. */
export function parseStoredDate(value: string | null | undefined): DateParts | null {
  const match = value?.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);

  if (!match) return null;

  return { year: Number(match[1]), month: match[2] ? Number(match[2]) : null, day: match[3] ? Number(match[3]) : null };
}

/** True when the supported date says at least as much as the stated one, and agrees with it. */
export function sameDate(stated: DateParts, supported: DateParts) {
  return (
    stated.year === supported.year &&
    (stated.month === null || stated.month === supported.month) &&
    (stated.day === null || stated.day === supported.day)
  );
}

// Counts

const NUMBER_WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  twenty: 20,
};

const TIME_UNIT = /^\s?(?:min|mins|minutes?|hours?|hrs?|h|days?|weeks?|months?|years?|am|pm)\b/i;

// The things evidence is counted in. "Three questions" or "two of us" count nothing in it.
const COUNTED = String.raw`backers?|investors?|funders?|grants?|rounds?|trails?|hops?|connections?|ties|signals?|agreements?|contracts?|partnerships?|sources?|compan(?:y|ies)|funds?|deals?|investments?|financings?|claims?|subsidiar(?:y|ies)|owners?|founders?|awards?|loans?|counterpart(?:y|ies)|siblings?|attendees?|satellites?`;

const DIGITS = /(?<![\p{L}\d.,:/#-])(\d+(?:\.\d+)?)\s?%?(?!\d|[.,:]\d|\p{L})/gu;
const WORDS = new RegExp(String.raw`\b(${Object.keys(NUMBER_WORDS).join("|")})\b`, "gi");
const COUNTED_NEXT = new RegExp(String.raw`^\s+(?:[\w-]+\s+){0,2}?(?:${COUNTED})\b`, "i");

/**
 * Plain numbers left after dates and amounts are taken. With `strict`, a number word counts only
 * when it counts evidence and durations are left alone; the evidence itself is read without it.
 */
export function takeCounts(scan: Scan, strict: boolean): { value: number; raw: string }[] {
  const found: { value: number; raw: string }[] = [];

  scan.take(DIGITS, (match) => {
    const after = scan.text.slice(match.index! + match[0].length);

    if (strict && TIME_UNIT.test(after)) return false;
    // A list number at the start of a line counts nothing.
    if (strict && match.index === 0 && /^[.)]/.test(after)) return false;

    found.push({ value: Number(match[1]), raw: match[0].trim() });
  });

  scan.take(WORDS, (match) => {
    if (strict && !COUNTED_NEXT.test(scan.text.slice(match.index! + match[0].length))) return false;

    found.push({ value: NUMBER_WORDS[match[1].toLowerCase()], raw: match[0] });
  });

  return found;
}
