import { describe, expect, it } from "vitest";
import { findReferences } from "./find";

const found = (text: string) => findReferences(text).map((r) => [r.text, r.passage.canonical]);

describe("findReferences", () => {
  it("finds references with their exact position, including repeats", () => {
    const text = "Read John 3:16, then (john 3:16) again.";
    const refs = findReferences(text);

    expect(refs.map((r) => text.slice(r.start, r.end))).toEqual(["John 3:16", "john 3:16"]);
    expect(refs.map((r) => r.passage.canonical)).toEqual(["JHN.3.16", "JHN.3.16"]);
  });

  it("handles numbered books, abbreviations, multi-word books, and ranges", () => {
    expect(found("See 1 Cor. 13:4–7 and Gen. 1:1, Song of Songs 2:4, Rom 8:28-30, Ps 23.")).toEqual([
      ["1 Cor. 13:4–7", "1CO.13.4-7"],
      ["Gen. 1:1", "GEN.1.1"],
      ["Song of Songs 2:4", "SNG.2.4"],
      ["Rom 8:28-30", "ROM.8.28-30"],
      ["Ps 23", "PSA.23"],
    ]);
  });

  it("keeps the book number when a non-reference word comes first", () => {
    expect(found("Memory verse 1 John 1:9 today")).toEqual([["1 John 1:9", "1JN.1.9"]]);
  });

  it("ignores numbers that are not references", () => {
    expect(found("Chapter 3 of the book, page 12, at 10:30, version 2.1, Jo 3")).toEqual([]);
  });
});
