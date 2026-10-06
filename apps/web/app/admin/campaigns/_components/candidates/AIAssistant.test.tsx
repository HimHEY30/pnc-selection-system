import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AssistantContext, CandidateAssistantService } from "@/lib/ai/assistant";
import AIAssistant from "./AIAssistant";

const context: AssistantContext = {
  mode: "create",
  percent: 20,
  currentSection: "person",
  sections: [],
  missing: ["nameEn"],
  summary: { province: null, hasSchool: false, hasSession: false, hasNgoSupport: false },
};

function fakeService(ask: CandidateAssistantService["ask"], mode: "demo" | "live" = "live"): CandidateAssistantService {
  return { mode, ask };
}

const open = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Open" }));

describe("AIAssistant", () => {
  it("starts closed, then offers the four questions and a box to ask anything", async () => {
    const user = userEvent.setup();
    render(<AIAssistant getContext={() => context} service={fakeService(vi.fn())} />);

    expect(screen.queryByRole("button", { name: "Explain required fields" })).not.toBeInTheDocument();
    await open(user);

    expect(screen.getByText("How can I help?")).toBeInTheDocument();
    for (const name of ["Explain required fields", "Check missing information", "Summarize this candidate", "What should I complete next?"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("textbox", { name: "Ask anything" })).toBeInTheDocument();
  });

  it("sends the chosen question with the current context, shows thinking, then the answer", async () => {
    const user = userEvent.setup();
    let finish: (value: { text: string }) => void = () => {};
    const ask = vi.fn<CandidateAssistantService["ask"]>(() => new Promise((resolve) => (finish = resolve)));
    render(<AIAssistant getContext={() => context} service={fakeService(ask)} />);
    await open(user);

    await user.click(screen.getByRole("button", { name: "Check missing information" }));

    expect(screen.getByRole("status")).toHaveTextContent("Thinking…");
    expect(ask).toHaveBeenCalledWith({ intent: "check-missing", context }, expect.any(AbortSignal));

    finish({ text: "One field is missing." });
    expect(await screen.findByText("One field is missing.")).toBeInTheDocument();
    expect(screen.getByText("Here's what I found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("asks a typed question with Enter and does not submit the form around it", async () => {
    const user = userEvent.setup();
    const ask = vi.fn<CandidateAssistantService["ask"]>(async () => ({ text: "ok" }));
    const submitted = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={submitted}>
        <AIAssistant getContext={() => context} service={fakeService(ask)} />
      </form>,
    );
    await open(user);

    await user.type(screen.getByRole("textbox", { name: "Ask anything" }), "Why is the phone needed?{Enter}");

    await waitFor(() => expect(ask).toHaveBeenCalledWith({ intent: "ask", question: "Why is the phone needed?", context }, expect.any(AbortSignal)));
    expect(submitted).not.toHaveBeenCalled();
  });

  it("says it could not finish when the service fails, and Try again asks the same question again", async () => {
    const user = userEvent.setup();
    const ask = vi.fn<CandidateAssistantService["ask"]>().mockRejectedValueOnce(new Error("down")).mockResolvedValue({ text: "Back now." });
    render(<AIAssistant getContext={() => context} service={fakeService(ask)} />);
    await open(user);

    await user.click(screen.getByRole("button", { name: "Summarize this candidate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("I couldn't complete that request.");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Back now.")).toBeInTheDocument();
    expect(ask).toHaveBeenLastCalledWith({ intent: "summarize", context }, expect.any(AbortSignal));
  });

  it("Retry repeats the last question", async () => {
    const user = userEvent.setup();
    const ask = vi.fn<CandidateAssistantService["ask"]>(async () => ({ text: "Answer" }));
    render(<AIAssistant getContext={() => context} service={fakeService(ask)} />);
    await open(user);
    await user.click(screen.getByRole("button", { name: "What should I complete next?" }));
    await screen.findByText("Answer");

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(ask.mock.calls[1][0].intent).toBe("next-step");
  });

  it("labels the demo as a demo and does not label a live service that way", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AIAssistant getContext={() => context} service={fakeService(vi.fn(), "demo")} />);
    await open(user);
    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText(/real AI service is not connected/)).toBeInTheDocument();
    unmount();

    render(<AIAssistant getContext={() => context} service={fakeService(vi.fn(), "live")} />);
    expect(screen.queryByText("Demo")).not.toBeInTheDocument();
  });

  it("cancels a question still being answered when it is hidden", async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | undefined;
    const ask = vi.fn<CandidateAssistantService["ask"]>((_request, s) => {
      signal = s;
      return new Promise(() => {});
    });
    render(<AIAssistant getContext={() => context} service={fakeService(ask)} />);
    await open(user);
    await user.click(screen.getByRole("button", { name: "Explain required fields" }));

    await user.click(screen.getByRole("button", { name: "Hide" }));

    expect(signal?.aborted).toBe(true);
  });
});
