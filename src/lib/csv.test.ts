import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";

describe("toCsv", () => {
  it("joins simple rows with commas and CRLF between rows", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
  });

  it("quotes a field containing a comma", () => {
    expect(toCsv([["Doe, Jane", "x"]])).toBe('"Doe, Jane",x');
  });

  it("quotes and escapes a field containing a double quote", () => {
    expect(toCsv([['Say "hi"', "x"]])).toBe('"Say ""hi""",x');
  });

  it("quotes a field containing a newline", () => {
    expect(toCsv([["line1\nline2", "x"]])).toBe('"line1\nline2",x');
  });

  it("renders null/undefined as an empty field", () => {
    expect(toCsv([[null, undefined, "x"]])).toBe(",,x");
  });

  it("renders booleans and numbers as their string form", () => {
    expect(toCsv([[true, false, 42]])).toBe("true,false,42");
  });
});

describe("parseCsv", () => {
  it("parses a simple multi-row, multi-column CSV", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("un-escapes a quoted field containing a comma", () => {
    expect(parseCsv('"Doe, Jane",x')).toEqual([["Doe, Jane", "x"]]);
  });

  it("un-escapes a doubled quote inside a quoted field", () => {
    expect(parseCsv('"Say ""hi""",x')).toEqual([['Say "hi"', "x"]]);
  });

  it("handles a trailing newline without producing an extra empty row", () => {
    expect(parseCsv("a,b\nc,d\n")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("round-trips through toCsv for values containing commas, quotes, and newlines", () => {
    const original = [
      ["name", "note"],
      ["Doe, Jane", 'She said "hi"\nagain'],
    ];
    expect(parseCsv(toCsv(original))).toEqual(original);
  });
});
