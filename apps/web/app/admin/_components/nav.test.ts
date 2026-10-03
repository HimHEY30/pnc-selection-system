import { describe, expect, it } from "vitest";
import { t } from "@/lib/messages";
import { NAV_GROUPS } from "./nav";

const items = NAV_GROUPS.flatMap((group) => group.items);
const itemNamed = (label: string) => items.find((item) => item.label === label);

describe("the sidebar", () => {
  it("opens Candidates, now that they can be managed", () => {
    const candidates = itemNamed(t.nav.candidates);

    expect(candidates).toBeDefined();
    expect(candidates?.disabled).toBeFalsy();
    expect(candidates?.href).toBe("/admin/candidates");
  });

  it("still locks what is not built: the entrance exam", () => {
    expect(items.filter((item) => item.disabled).map((item) => item.href)).toEqual(["/admin/exam"]);
  });
});
