import { describe, expect, it } from "vitest";
import { partsInOrder, validateCopy } from "./copy";
import type { CopyPartKey } from "./types";

const ticked = (...keys: CopyPartKey[]) => new Set<CopyPartKey>(keys);

describe("validateCopy", () => {
  it("needs a campaign to copy from before anything else", () => {
    expect(validateCopy("", ticked("Provinces"))).toEqual({ source: "Choose the campaign to copy from." });
    expect(validateCopy("", ticked())).toEqual({ source: "Choose the campaign to copy from." });
  });

  it("needs at least one thing ticked", () => {
    expect(validateCopy("abc", ticked())).toEqual({ parts: "Choose at least one thing to copy." });
  });

  it("is happy with a campaign and one thing", () => {
    expect(validateCopy("abc", ticked("Details"))).toEqual({});
  });
});

describe("partsInOrder", () => {
  it("puts the ticked parts in the order they are copied, whatever order they were ticked in", () => {
    expect(partsInOrder(ticked("InformationSessions", "Provinces", "EligibilityRules"))).toEqual([
      "Provinces",
      "EligibilityRules",
      "InformationSessions",
    ]);
  });

  it("is empty when nothing is ticked", () => {
    expect(partsInOrder(ticked())).toEqual([]);
  });
});
