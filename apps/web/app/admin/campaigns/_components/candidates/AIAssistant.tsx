"use client";

import { useEffect, useId, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { TextInput } from "@/components/ui/inputs";
import {
  candidateAssistant,
  type AssistantContext,
  type AssistantIntent,
  type CandidateAssistantService,
} from "@/lib/ai/assistant";
import { t } from "@/lib/messages";

type Props = {
  /** What the assistant may know about the form right now. Read when a question is asked, not before. */
  getContext: () => AssistantContext;
  /** Which assistant answers. The screen does not know or care whether it is the demo or a real AI. */
  service?: CandidateAssistantService;
};

const text = t.candidates.assistant;

const ACTIONS: { intent: Exclude<AssistantIntent, "ask">; label: string }[] = [
  { intent: "explain-required", label: text.actions.explain },
  { intent: "check-missing", label: text.actions.missing },
  { intent: "summarize", label: text.actions.summarize },
  { intent: "next-step", label: text.actions.next },
];

type Asked = { intent: AssistantIntent; question?: string };
type Answer = { status: "idle" } | { status: "thinking" } | { status: "response"; text: string } | { status: "error" };

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z" />
    </svg>
  );
}

/**
 * A help panel inside the candidate form. It asks the assistant service about the form's state (field names and progress
 * only; see AssistantContext) and shows one answer at a time. Closed, it is a single quiet row so it never competes with the form.
 */
export default function AIAssistant({ getContext, service = candidateAssistant }: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<Answer>({ status: "idle" });
  const [question, setQuestion] = useState("");
  const [copied, setCopied] = useState(false);
  const last = useRef<Asked | null>(null);
  const request = useRef<AbortController | null>(null);

  // Nothing is left running when the form closes.
  useEffect(() => () => request.current?.abort(), []);

  async function ask(asked: Asked) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    last.current = asked;
    setCopied(false);
    setAnswer({ status: "thinking" });
    try {
      const reply = await service.ask({ ...asked, context: getContext() }, controller.signal);
      if (!controller.signal.aborted) setAnswer({ status: "response", text: reply.text });
    } catch {
      if (!controller.signal.aborted) setAnswer({ status: "error" });
    }
  }

  function submitQuestion() {
    const typed = question.trim();
    if (!typed) return;
    setQuestion("");
    void ask({ intent: "ask", question: typed });
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function close() {
    request.current?.abort();
    setAnswer({ status: "idle" });
    setOpen(false);
  }

  return (
    <section aria-label={text.title} className="rounded-xl border border-line bg-canvas">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Sparkle />
          </span>
          <h3 className="text-sm font-semibold text-ink">{text.title}</h3>
          {service.mode === "demo" && (
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-ink">{text.demo}</span>
          )}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => (open ? close() : setOpen(true))}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-primary transition-colors duration-150 hover:bg-primary-soft focus-ring"
        >
          {open ? text.hide : text.open}
        </button>
      </div>

      {open && (
        <div id={panelId} className="motion-rise border-t border-line px-4 pb-4 pt-3">
          <p className="text-sm font-semibold text-ink">{text.intro}</p>
          {service.mode === "demo" && <p className="mb-3 mt-0.5 text-[13px] text-ink-muted">{text.demoNote}</p>}

          <div className="grid gap-2 sm:grid-cols-2">
            {ACTIONS.map((action) => (
              <button
                key={action.intent}
                type="button"
                disabled={answer.status === "thinking"}
                onClick={() => void ask({ intent: action.intent })}
                className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-left text-sm font-medium text-ink transition-colors duration-150 hover:border-brand-blue hover:bg-primary-soft focus-ring disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:border-line-strong disabled:hover:bg-surface"
              >
                {action.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <TextInput
              aria-label={text.askLabel}
              placeholder={text.askPlaceholder}
              value={question}
              maxLength={300}
              onChange={(e) => setQuestion(e.target.value)}
              // Enter asks the assistant; it must not save the candidate form this panel sits in.
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (answer.status !== "thinking") submitQuestion();
                }
              }}
              className="py-2 text-sm"
            />
            <Button onClick={submitQuestion} disabled={answer.status === "thinking" || !question.trim()}>
              {text.send}
            </Button>
          </div>

          <div aria-live="polite" className="mt-3">
            {answer.status === "thinking" && (
              <p role="status" className="motion-rise flex items-center gap-2 text-sm text-ink-muted">
                <span aria-hidden="true" className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span key={delay} className="size-1.5 animate-pulse rounded-full bg-brand-blue" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </span>
                {text.thinking}
              </p>
            )}

            {answer.status === "response" && (
              <div className="motion-rise rounded-lg border border-primary-line bg-surface p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{text.found}</p>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink">{answer.text}</p>
                <div className="mt-3 flex gap-1 border-t border-line pt-2">
                  <Button className="px-3 py-1.5" onClick={() => void copy(answer.text)}>
                    {copied ? text.copied : text.copy}
                  </Button>
                  <Button className="px-3 py-1.5" onClick={() => last.current && void ask(last.current)}>
                    {text.retry}
                  </Button>
                </div>
              </div>
            )}

            {answer.status === "error" && (
              <div role="alert" className="motion-rise rounded-lg border border-danger/30 bg-danger-soft p-3">
                <p className="text-sm font-semibold text-danger-text">{text.errorTitle}</p>
                <p className="mt-0.5 text-sm text-danger-text">{text.errorBody}</p>
                <Button variant="primary" className="mt-2" onClick={() => last.current && void ask(last.current)}>
                  {t.common.tryAgain}
                </Button>
              </div>
            )}
          </div>

          <p className="mt-3 text-xs text-ink-muted">{text.privacy}</p>
        </div>
      )}
    </section>
  );
}
