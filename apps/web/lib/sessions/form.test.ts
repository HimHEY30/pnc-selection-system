import { describe, expect, it } from "vitest";
import { doneSession, sessionFixture, unscheduledSession } from "@/test-utils/session-fixtures";
import {
  emptyHostForm,
  emptySessionForm,
  formFromSession,
  parseCount,
  toHostRequest,
  toSessionRequest,
  validateHostForm,
  validateSessionForm,
  type SessionForm,
} from "./form";

const valid = (overrides: Partial<SessionForm> = {}): SessionForm => ({
  ...emptySessionForm("manager-1"),
  title: "Open day",
  date: "2027-03-20",
  venue: "School hall",
  ...overrides,
});

describe("a new session form", () => {
  it("starts in person, 09:00 to 11:00, with the person adding it responsible and running it", () => {
    expect(emptySessionForm("manager-1")).toEqual({
      title: "",
      date: "",
      startTime: "09:00",
      endTime: "11:00",
      format: "InPerson",
      venue: "",
      meetingLink: "",
      provinceId: "",
      notes: "",
      assigneeId: "manager-1",
      hostType: "Officer",
      hostId: "",
      hostUserId: "manager-1",
    });
  });
});

describe("formFromSession", () => {
  it("turns a session back into the form's text", () => {
    const form = formFromSession(
      sessionFixture({
        province: { id: 17, name: "Siem Reap" },
        notes: "Bring posters",
        host: { type: "Partner", name: "Hope School", userId: null, hostId: "h-1", partnerKind: "HighSchool", phone: null, email: null, isActive: true },
      }),
      "officer-1",
    );

    expect(form).toMatchObject({
      title: "Open day at Kampong Cham High School",
      date: "2099-03-20",
      provinceId: "17",
      notes: "Bring posters",
      hostType: "Partner",
      hostId: "h-1",
      hostUserId: "",
      assigneeId: "officer-1",
    });
  });

  it("uses empty text for what a session does not have", () => {
    const form = formFromSession(sessionFixture({ format: "Online", venue: null, meetingLink: "https://meet.example.org/x" }), "officer-1");

    expect(form.venue).toBe("");
    expect(form.provinceId).toBe("");
    expect(form.notes).toBe("");
    expect(form.meetingLink).toBe("https://meet.example.org/x");
  });

  it("starts the form of a copy with no date, the usual times, and the person scheduling it", () => {
    const form = formFromSession(
      unscheduledSession({ title: "Copied visit", format: "InPerson", venue: "School hall", notes: "Bring posters" }),
      "manager-1",
    );

    expect(form).toMatchObject({
      title: "Copied visit",
      venue: "School hall",
      notes: "Bring posters",
      date: "",
      startTime: "09:00",
      endTime: "11:00",
      assigneeId: "manager-1",
      hostType: "Officer",
      hostUserId: "manager-1",
      hostId: "",
    });
  });

  it("round-trips through the request unchanged", () => {
    const session = doneSession({ province: { id: 2, name: "Battambang" }, notes: "x" });

    const request = toSessionRequest(formFromSession(session, "officer-1"));

    expect(request).toMatchObject({
      title: session.title,
      date: session.date,
      startTime: "09:00",
      endTime: "11:00",
      format: "InPerson",
      venue: "School hall",
      provinceId: 2,
      notes: "x",
      assigneeId: "officer-1",
      hostType: "Officer",
      hostId: null,
      hostUserId: "officer-1",
    });
  });
});

describe("toSessionRequest", () => {
  it("trims text and sends blanks as null", () => {
    const request = toSessionRequest(valid({ title: "  Open day  ", notes: "   ", date: "" }));

    expect(request.title).toBe("Open day");
    expect(request.notes).toBeNull();
    expect(request.date).toBeNull();
  });

  it("sends the venue and link only for the formats that use them", () => {
    const base = { venue: "Hall", meetingLink: "https://meet.example.org/x" };

    expect(toSessionRequest(valid({ ...base, format: "InPerson" }))).toMatchObject({ venue: "Hall", meetingLink: null });
    expect(toSessionRequest(valid({ ...base, format: "Online" }))).toMatchObject({ venue: null, meetingLink: "https://meet.example.org/x" });
    expect(toSessionRequest(valid({ ...base, format: "Hybrid" }))).toMatchObject({ venue: "Hall", meetingLink: "https://meet.example.org/x" });
  });

  it("sends a user id for an officer host and a directory id for an alumnus or a partner, never both", () => {
    const stray = { hostId: "h-1", hostUserId: "officer-1" };

    expect(toSessionRequest(valid({ ...stray, hostType: "Officer" }))).toMatchObject({ hostId: null, hostUserId: "officer-1" });
    expect(toSessionRequest(valid({ ...stray, hostType: "Alumni" }))).toMatchObject({ hostId: "h-1", hostUserId: null });
    expect(toSessionRequest(valid({ ...stray, hostType: "Partner" }))).toMatchObject({ hostId: "h-1", hostUserId: null });
  });

  it("sends the province as a number, or null when none is chosen", () => {
    expect(toSessionRequest(valid({ provinceId: "17" })).provinceId).toBe(17);
    expect(toSessionRequest(valid({ provinceId: "" })).provinceId).toBeNull();
  });
});

describe("validateSessionForm", () => {
  it("accepts a complete form", () => {
    expect(validateSessionForm(valid())).toEqual({});
  });

  it("asks for a title, within 120 characters", () => {
    expect(validateSessionForm(valid({ title: "  " })).title).toBe("Enter a title.");
    expect(validateSessionForm(valid({ title: "a".repeat(120) })).title).toBeUndefined();
    expect(validateSessionForm(valid({ title: "a".repeat(121) })).title).toBe("Use at most 120 characters.");
  });

  it("asks for a date", () => {
    expect(validateSessionForm(valid({ date: "" })).date).toBe("Choose the date.");
  });

  it("asks for real times, with the end after the start", () => {
    expect(validateSessionForm(valid({ startTime: "9am" })).startTime).toBe("Enter a start time such as 09:00.");
    expect(validateSessionForm(valid({ startTime: "24:00" })).startTime).toBeDefined();
    expect(validateSessionForm(valid({ endTime: "" })).endTime).toBe("Enter an end time such as 11:00.");
    expect(validateSessionForm(valid({ startTime: "11:00", endTime: "11:00" })).endTime).toBe("The end must be after the start.");
    expect(validateSessionForm(valid({ startTime: "11:00", endTime: "09:00" })).endTime).toBe("The end must be after the start.");
    expect(validateSessionForm(valid({ startTime: "09:00", endTime: "09:01" })).endTime).toBeUndefined();
  });

  it("does not also say the end is too early when the start is not a time", () => {
    const errors = validateSessionForm(valid({ startTime: "", endTime: "08:00" }));

    expect(errors.startTime).toBeDefined();
    expect(errors.endTime).toBeUndefined();
  });

  it("needs a venue for in person and hybrid, and a web link for online and hybrid", () => {
    expect(validateSessionForm(valid({ format: "InPerson", venue: " " })).venue).toBe("Enter where the session takes place.");
    expect(validateSessionForm(valid({ format: "Online", meetingLink: "" })).meetingLink).toBe("Enter the link people will join with.");
    expect(validateSessionForm(valid({ format: "Hybrid", venue: "", meetingLink: "" }))).toMatchObject({
      venue: expect.any(String),
      meetingLink: expect.any(String),
    });
  });

  it("does not ask for a venue online, or a link in person", () => {
    expect(validateSessionForm(valid({ format: "Online", venue: "", meetingLink: "https://meet.example.org/x" }))).toEqual({});
    expect(validateSessionForm(valid({ format: "InPerson", venue: "Hall", meetingLink: "" }))).toEqual({});
  });

  it.each(["meet.example.org", "ftp://example.org", "javascript:alert(1)", "https://", "not a link"])("refuses %s as a link", (link) => {
    expect(validateSessionForm(valid({ format: "Online", venue: "", meetingLink: link })).meetingLink).toBe(
      "Enter a web address starting with https://.",
    );
  });

  it("accepts http and https links", () => {
    expect(validateSessionForm(valid({ format: "Online", meetingLink: "http://meet.example.org/x" })).meetingLink).toBeUndefined();
    expect(validateSessionForm(valid({ format: "Online", meetingLink: "https://meet.example.org/x" })).meetingLink).toBeUndefined();
  });

  it("limits notes to 1000 characters", () => {
    expect(validateSessionForm(valid({ notes: "n".repeat(1000) })).notes).toBeUndefined();
    expect(validateSessionForm(valid({ notes: "n".repeat(1001) })).notes).toBe("Use at most 1000 characters.");
  });

  it("needs someone responsible and someone to run it", () => {
    expect(validateSessionForm(valid({ assigneeId: "" })).assigneeId).toBe("Choose who is responsible for this session.");
    expect(validateSessionForm(valid({ hostType: "Officer", hostUserId: "" })).hostUserId).toBe("Choose the officer who runs the session.");
    expect(validateSessionForm(valid({ hostType: "Alumni", hostId: "" })).hostId).toBe("Choose the alumnus who runs the session.");
    expect(validateSessionForm(valid({ hostType: "Partner", hostId: "" })).hostId).toBe("Choose the partner who runs the session.");
    expect(validateSessionForm(valid({ hostType: "Partner", hostId: "h-1" })).hostId).toBeUndefined();
  });
});

describe("parseCount", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["0", 0],
    ["42", 42],
    [" 18 ", 18],
    ["5000", 5000],
    ["007", 7],
  ])("reads %j as %j", (text, expected) => {
    expect(parseCount(text)).toBe(expected);
  });

  it.each(["-1", "1.5", "1,5", "abc", "5001", "1e3", "+3", "12 3"])("refuses %j", (text) => {
    expect(parseCount(text)).toBeUndefined();
  });
});

describe("host forms", () => {
  it("sends an alumnus without partner details", () => {
    const request = toHostRequest("Alumni", { name: " Chenda Sok ", partnerKind: "Ngo", contactPerson: "Someone", phone: " 012 345 678 ", email: "" });

    expect(request).toEqual({ type: "Alumni", name: "Chenda Sok", partnerKind: null, contactPerson: null, phone: "012 345 678", email: null });
  });

  it("sends a partner with its kind and contact person", () => {
    const request = toHostRequest("Partner", { name: "Hope School", partnerKind: "HighSchool", contactPerson: " Mr Rith ", phone: "", email: "info@hope.example.org" });

    expect(request).toEqual({
      type: "Partner",
      name: "Hope School",
      partnerKind: "HighSchool",
      contactPerson: "Mr Rith",
      phone: null,
      email: "info@hope.example.org",
    });
  });

  it("asks for a name, a kind for a partner, and a way to reach the host", () => {
    expect(validateHostForm("Alumni", emptyHostForm)).toEqual({
      name: "Enter a name.",
      phone: "Give a phone number or an email address.",
    });
    expect(validateHostForm("Partner", emptyHostForm)).toEqual({
      name: "Enter a name.",
      partnerKind: "Choose what kind of organisation this is.",
      phone: "Give a phone number or an email address.",
    });
    expect(validateHostForm("Partner", { ...emptyHostForm, name: "Hope", partnerKind: "Ngo", email: "a@b.org" })).toEqual({});
    expect(validateHostForm("Alumni", { ...emptyHostForm, name: "Chenda", phone: "012 345 678" })).toEqual({});
  });
});
