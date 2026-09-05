import { describe, expect, it } from "vitest";
import { toCsv } from "../src/lib/csv";

describe("toCsv", () => {
  it("emits CRLF rows and union header for empty columns arg", () => {
    const csv = toCsv([
      { a: 1, b: "x" },
      { a: 2, c: "y" },
    ]);
    expect(csv).toBe("a,b,c\r\n1,x,\r\n2,,y");
  });

  it("respects provided column order", () => {
    const csv = toCsv([{ a: 1, b: 2 }], ["b", "a"]);
    expect(csv).toBe("b,a\r\n2,1");
  });

  it("escapes quotes, commas and newlines", () => {
    const csv = toCsv([{ note: 'He said "hi", twice' }, { note: "line1\nline2\r\nend" }]);
    expect(csv).toBe(
      'note\r\n"He said ""hi"", twice"\r\n"line1\nline2\r\nend"',
    );
  });

  it("renders null/undefined as empty cells", () => {
    expect(toCsv([{ a: null, b: undefined, c: 0 }])).toBe("a,b,c\r\n,,0");
  });

  it("neutralizes formula injection characters (=, +, @, tab, cr) without corrupting negative numbers", () => {
    const csv = toCsv([
      { val: "=cmd|' /C calc'!A0" },
      { val: "+12345" },
      { val: "-100" },
      { val: "-cmd" },
      { val: "@SUM(1,2)" },
      { val: "\ttabbed" },
    ]);
    expect(csv).toContain("'=cmd");
    expect(csv).toContain("'+12345");
    expect(csv).toContain("\r\n-100\r\n");
    expect(csv).not.toContain("'-100");
    expect(csv).toContain("'-cmd");
    expect(csv).toContain("'@SUM(1,2)");
    expect(csv).toContain("'\ttabbed");
  });
});
