import { describe, expect, it } from "vitest";
import { emptyCandidateForm, type CandidateForm } from "@/lib/candidates/form";
import { buildAssistantContext } from "./assistant";
import { demoAssistant } from "./demoAssistant";

const filled: CandidateForm = {
  nameKm: "សុខ ចិន្តា",
  nameEn: "Sok Chenda",
  gender: "Female",
  dateOfBirth: "2009-05-20",
  phone: "012 345 678",
  address: {
    province: { code: "12", name: "Phnom Penh" },
    district: { code: "1201", name: "Chamkar Mon" },
    commune: { code: "120101", name: "Tonle Basak" },
    village: { code: "12010101", name: "Phum Muoy" },
  },
  school: "host-secret-id",
  schoolName: "",
  sessionId: "session-secret-id",
  ngo: "yes",
  ngoName: "Hope NGO",
};

describe("buildAssistantContext", () => {
  it("shares field names and counts, and never the person's details", () => {
    const sent = JSON.stringify(buildAssistantContext(filled, "edit"));

    for (const secret of ["Sok Chenda", "សុខ ចិន្តា", "2009-05-20", "012 345 678", "Chamkar Mon", "Tonle Basak", "Phum Muoy", "host-secret-id", "session-secret-id", "Hope NGO"]) {
      expect(sent).not.toContain(secret);
    }
    expect(sent).toContain("Phnom Penh");
  });

  it("reports what is missing in an empty form", () => {
    const context = buildAssistantContext(emptyCandidateForm(), "create");

    expect(context).toMatchObject({ mode: "create", percent: 0, currentSection: "person" });
    expect(context.missing).toHaveLength(9);
  });
});

describe("demoAssistant", () => {
  it("is labelled as a demo", () => {
    expect(demoAssistant.mode).toBe("demo");
  });

  it("answers from the form's state: what is missing and what to do next", async () => {
    const context = buildAssistantContext(emptyCandidateForm(), "create");

    const missing = await demoAssistant.ask({ intent: "check-missing", context });
    expect(missing.text).toContain("9 required fields are still empty");
    expect(missing.text).toContain("Name in Khmer");

    const next = await demoAssistant.ask({ intent: "next-step", context });
    expect(next.text).toContain("Personal information");
  });

  it("says plainly that free-form questions are not answered", async () => {
    const reply = await demoAssistant.ask({ intent: "ask", question: "anything", context: buildAssistantContext(filled, "edit") });

    expect(reply.text).toMatch(/not connected/);
  });

  it("stops waiting when the request is cancelled", async () => {
    const controller = new AbortController();
    const pending = demoAssistant.ask({ intent: "summarize", context: buildAssistantContext(filled, "edit") }, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
