import { describe, expect, it } from "vitest";
import { t } from "@/lib/messages";
import { GUIDE_COOKIE, guideFor, seenCookie } from "./guide";

describe("guideFor", () => {
  it("gives admins and managers the campaign guide", () => {
    expect(guideFor(["selection-manager"]).audience).toBe("manager");
    expect(guideFor(["system-admin"]).audience).toBe("manager");
    expect(guideFor(["selection-manager"]).steps).toBe(t.guide.manager);
  });

  it("gives officers the guide for what an officer can do", () => {
    const guide = guideFor(["selection-officer"]);

    expect(guide.audience).toBe("officer");
    expect(guide.steps).toBe(t.guide.officer);
  });

  it("gives someone who is both an officer and a manager the manager guide, since they can do more", () => {
    expect(guideFor(["selection-officer", "selection-manager"]).audience).toBe("manager");
  });

  it("never tells an officer to create a campaign, which they cannot do", () => {
    const officerText = t.guide.officer.flatMap((s) => [s.title, s.body, ...s.points]).join(" ");

    expect(officerText).not.toMatch(/create campaign/i);
  });

  it("gives every step of both guides a title and a body, and no empty or repeated point", () => {
    for (const steps of [t.guide.manager, t.guide.officer]) {
      expect(steps.length).toBeGreaterThanOrEqual(4);
      for (const step of steps) {
        expect(step.title.trim()).not.toBe("");
        expect(step.body.trim()).not.toBe("");
        expect(new Set(step.points).size).toBe(step.points.length);
        for (const point of step.points) expect(point.trim()).not.toBe("");
      }
    }
  });
});

describe("seenCookie", () => {
  it("lasts a year, covers the whole site and is not sent to other sites", () => {
    const cookie = seenCookie();

    expect(cookie.startsWith(`${GUIDE_COOKIE}=1;`)).toBe(true);
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
  });
});
