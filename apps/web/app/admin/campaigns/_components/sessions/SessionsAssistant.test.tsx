import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessionsAssistantService, SessionsContext } from "@/lib/ai/sessionsAssistant";
import SessionsAssistant from "./SessionsAssistant";

const context: SessionsContext = {
  campaignStatus: "Active",
  isEditable: true,
  canManage: true,
  summary: { total: 2, planned: 2, done: 0, cancelled: 0, expectedCandidates: 0, actualFemale: 0, actualMale: 0, actualTotal: 0, unscheduled: 0 },
  attention: [{ kind: "missing-expected", count: 2 }],
};

const fakeService = (ask: SessionsAssistantService["ask"], mode: "demo" | "live" = "live"): SessionsAssistantService => ({ mode, ask });

const launcher = () => screen.getByRole("button", { name: "Ask the AI Assistant" });
const open = async (user: ReturnType<typeof userEvent.setup>) => user.click(launcher());

describe("SessionsAssistant", () => {
  it("is one quiet button until it is opened, then offers four questions and a box to ask anything", async () => {
    const user = userEvent.setup();
    render(<SessionsAssistant getContext={() => context} service={fakeService(vi.fn())} />);

    expect(launcher()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "AI Assistant" })).not.toBeInTheDocument();
    await open(user);

    expect(screen.getByRole("region", { name: "AI Assistant" })).toBeInTheDocument();
    for (const name of ["Summarize this campaign's sessions", "What needs attention?", "What should I do next?", "Explain the statuses"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("textbox", { name: "Ask anything" })).toHaveFocus();
  });

  it("sends the chosen question with the current context, shows thinking, then the answer in the history", async () => {
    const user = userEvent.setup();
    let finish: (value: { text: string }) => void = () => {};
    const ask = vi.fn<SessionsAssistantService["ask"]>(() => new Promise((resolve) => (finish = resolve)));
    render(<SessionsAssistant getContext={() => context} service={fakeService(ask)} />);
    await open(user);

    await user.click(screen.getByRole("button", { name: "What needs attention?" }));

    expect(screen.getByRole("status")).toHaveTextContent("Thinking…");
    expect(ask).toHaveBeenCalledWith({ intent: "needs-attention", question: undefined, context }, expect.any(AbortSignal));

    finish({ text: "Two sessions need numbers." });
    expect(await screen.findByText("Two sessions need numbers.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("keeps earlier answers when another question is asked", async () => {
    const user = userEvent.setup();
    const ask = vi.fn<SessionsAssistantService["ask"]>(async ({ intent }) => ({ text: `answer to ${intent}` }));
    render(<SessionsAssistant getContext={() => context} service={fakeService(ask)} />);
    await open(user);

    await user.click(screen.getByRole("button", { name: "What needs attention?" }));
    await screen.findByText("answer to needs-attention");
    await user.click(screen.getByRole("button", { name: "What should I do next?" }));

    expect(await screen.findByText("answer to next-step")).toBeInTheDocument();
    expect(screen.getByText("answer to needs-attention")).toBeInTheDocument();
  });

  it("asks a typed question with Enter and does not submit a form around it", async () => {
    const user = userEvent.setup();
    const ask = vi.fn<SessionsAssistantService["ask"]>(async () => ({ text: "ok" }));
    const submitted = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={submitted}>
        <SessionsAssistant getContext={() => context} service={fakeService(ask)} />
      </form>,
    );
    await open(user);

    await user.type(screen.getByRole("textbox", { name: "Ask anything" }), "Which are late?{Enter}");

    await waitFor(() => expect(ask).toHaveBeenCalledWith({ intent: "ask", question: "Which are late?", context }, expect.any(AbortSignal)));
    expect(submitted).not.toHaveBeenCalled();
  });

  it("says it could not finish when the service fails, and Try again asks the same question again", async () => {
    const user = userEvent.setup();
    const ask = vi.fn<SessionsAssistantService["ask"]>().mockRejectedValueOnce(new Error("down")).mockResolvedValue({ text: "Back now." });
    render(<SessionsAssistant getContext={() => context} service={fakeService(ask)} />);
    await open(user);

    await user.click(screen.getByRole("button", { name: "Explain the statuses" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("I couldn't complete that request.");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Back now.")).toBeInTheDocument();
    expect(ask).toHaveBeenLastCalledWith({ intent: "explain-statuses", question: undefined, context }, expect.any(AbortSignal));
    // The retry replaces the failed exchange instead of adding a second one.
    expect(screen.getAllByText("Explain the statuses")).toHaveLength(2);
  });

  it("labels the demo as a demo and does not label a live service that way", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SessionsAssistant getContext={() => context} service={fakeService(vi.fn(), "demo")} />);
    await open(user);
    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText(/real AI service is not connected/)).toBeInTheDocument();
    unmount();

    render(<SessionsAssistant getContext={() => context} service={fakeService(vi.fn(), "live")} />);
    await open(user);
    expect(screen.queryByText("Demo")).not.toBeInTheDocument();
  });

  it("closes on Escape, cancels a question still being answered, and returns focus to the button", async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | undefined;
    const ask = vi.fn<SessionsAssistantService["ask"]>((_request, s) => {
      signal = s;
      return new Promise(() => {});
    });
    render(<SessionsAssistant getContext={() => context} service={fakeService(ask)} />);
    await open(user);
    await user.click(screen.getByRole("button", { name: "What should I do next?" }));

    await user.keyboard("{Escape}");

    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole("region", { name: "AI Assistant" })).not.toBeInTheDocument();
    expect(launcher()).toHaveFocus();
  });

  it("lets a second question replace one still being answered, and leaves focus in the box", async () => {
    const user = userEvent.setup();
    const signals: AbortSignal[] = [];
    const ask = vi.fn<SessionsAssistantService["ask"]>((request, s) => {
      if (s) signals.push(s);
      return request.intent === "summarize" ? new Promise(() => {}) : Promise.resolve({ text: "second answer" });
    });
    render(<SessionsAssistant getContext={() => context} service={fakeService(ask)} />);
    await open(user);

    await user.click(screen.getByRole("button", { name: "Summarize this campaign's sessions" }));
    expect(screen.getByRole("textbox", { name: "Ask anything" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "What should I do next?" }));

    expect(await screen.findByText("second answer")).toBeInTheDocument();
    expect(signals[0].aborted).toBe(true);
    // Only the question that is being answered is left in the history.
    expect(screen.queryByText("Summarize this campaign's sessions", { selector: "p" })).not.toBeInTheDocument();
  });

  it("states what is shared, and it is only counts", async () => {
    const user = userEvent.setup();
    render(<SessionsAssistant getContext={() => context} service={fakeService(vi.fn())} />);
    await open(user);

    expect(screen.getByText(/Only counts are shared/)).toBeInTheDocument();
  });
});
