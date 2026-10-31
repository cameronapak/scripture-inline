import { tryParsePassage, type ParsedPassage } from "grab-bcv";

export type FoundReference = {
  /** Offset of the first character of the reference in the scanned text. */
  start: number;
  /** Offset just past the last character of the reference. */
  end: number;
  /** The reference exactly as written, such as "1 Cor. 13:4-7". */
  text: string;
  passage: ParsedPassage;
};

// A loose candidate: optional book number, one book word (or "Song of Songs"),
// a chapter, then an optional verse and range. grab-bcv decides what is real.
const CANDIDATE =
  /(?<![\w:.])(?:[1-3]\s?)?[A-Za-z]{2,}\.?(?:\s+of\s+[A-Za-z]+)?\s+\d{1,3}(?:[:.]\d{1,3})?(?:\s?[-\u2010-\u2015]\s?\d{1,3}(?:[:.]\d{1,3})?)?(?![\w:])/g;

/** Finds every Bible reference in `text`, in order, with its exact position. */
export function findReferences(text: string): FoundReference[] {
  const found: FoundReference[] = [];
  const pattern = new RegExp(CANDIDATE);
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const result = tryParsePassage(match[0]);
    if (result.ok) {
      found.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        passage: result.value,
      });
    } else {
      // Retry one character later, so "verse 1 John 1:9" still finds "1 John 1:9".
      pattern.lastIndex = match.index + 1;
    }
  }

  return found;
}
