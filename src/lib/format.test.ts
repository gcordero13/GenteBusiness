import { describe, expect, it } from "vitest";
import { titleCase } from "./format";

describe("titleCase", () => {
  it("capitalizes each word", () => {
    expect(titleCase("juan perez")).toBe("Juan Perez");
  });
});
