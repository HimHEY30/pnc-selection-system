"use client";

import { useEffect, useId, useRef, useState } from "react";
import Button, { buttonClasses } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/inputs";
import {
  sessionsAssistant,
  type SessionsAssistantService,
  type SessionsContext,
  type SessionsIntent,
} from "@/lib/ai/sessionsAssistant";
import { t } from "@/lib/messages";

type Props = {
  /** What the assistant may know about the page right now. Read when a question is asked, not before. */
  getContext: () => SessionsContext;
  /** Which assistant answers. The screen does not know or care whether it is the demo or a real AI. */
  service?: SessionsAssistantService;
};

const text = t.sessions.assistant;

const ACTIONS: { intent: Exclude<SessionsIntent, "ask">; label: string }[] = [
  { intent: "summarize", label: text.actions.summarize },
  { intent: "needs-attention", label: text.actions.attention },
  { intent: "next-step", label: text.actions.next },
  { intent: "explain-statuses", label: text.actions.statuses },
];

/** How many questions the panel keeps in view; older ones scroll away for good, nothing is stored. */
const HISTORY = 6;

type Exchange = {
  id: number;
  intent: SessionsIntent;
  /** What is shown as the person's side of the exchange. */
  label: string;
  question?: string;
  result: { status: "thinking" } | { status: "response"; text: string } | { status: "error" };
};

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z" />
    </svg>
  );
}

/**
 * A floating assistant for the sessions page. A round-cornered button in the corner opens a small panel with four
 * suggested questions, a box to ask anything, and the last few answers. It asks the service about counts only (see
 * SessionsContext) and keeps the conversation in memory: closing the panel cancels a pending question, and nothing
 * outlives the page. Closed, it is one quiet button, so it never competes with the sessions.
 */
export default function SessionsAssistant({ getContext, service = sessionsAssistant }: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [question, setQuestion] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  // Nothing is left running when the page closes.
  useEffect(() => () => request.current?.abort(), []);

  // The newest answer is brought into view as it arrives.
  useEffect(() => {
    log.current?.scrollTo?.({ top: log.current.scrollHeight });
  }, [exchanges]);

  useEffect(() => {
    if (open) panel.current?.querySelector("input")?.focus();
  }, [open]);

  async function ask(asked: Pick<Exchange, "intent" | "label" | "question">, replaceId?: number) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const id = replaceId ?? nextId.current++;
    const fresh: Exchange = { id, ...asked, result: { status: "thinking" } };
    setCopiedId(null);
    // Asking again cancels a question still being answered, so that one has no answer to wait for and is dropped.
    setExchanges((all) => {
      const settled = all.filter((e) => e.result.status !== "thinking" || e.id === id);
      return replaceId === undefined ? [...settled, fresh].slice(-HISTORY) : settled.map((e) => (e.id === id ? fresh : e));
    });
    // The button that was pressed may be about to change or go away; keep the keyboard where it can still work.
    panel.current?.querySelector("input")?.focus();

    let result: Exchange["result"];
    try {
      const reply = await service.ask({ intent: asked.intent, question: asked.question, context: getContext() }, controller.signal);
      result = { status: "response", text: reply.text };
    } catch {
      result = { status: "error" };
    }
    if (!controller.signal.aborted) setExchanges((all) => all.map((e) => (e.id === id ? { ...e, result } : e)));
  }

  function submitQuestion() {
    const typed = question.trim();
    if (!typed) return;
    setQuestion("");
    void ask({ intent: "ask", label: typed, question: typed });
  }

  async function copy(exchange: Exchange) {
    if (exchange.result.status !== "response") return;
    try {
      await navigator.clipboard.writeText(exchange.result.text);
      setCopiedId(exchange.id);
    } catch {
      setCopiedId(null);
    }
  }

  function close() {
    request.current?.abort();
    // A question that was still being answered has no answer to keep.
    setExchanges((all) => all.filter((e) => e.result.status !== "thinking"));
    setOpen(false);
    launcher.current?.focus();
  }

  return (
    <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open && (
        <section
          ref={panel}
          id={panelId}
          aria-label={text.title}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          className="motion-rise flex max-h-[min(36rem,calc(100dvh-7rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-overlay sm:w-96"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Sparkle />
              </span>
              <h2 className="text-sm font-semibold text-ink">{text.title}</h2>
              {service.mode === "demo" && (
                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-ink">{text.demo}</span>
              )}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={text.close}
              className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-canvas hover:text-ink focus-ring"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div ref={log} aria-live="polite" className="flex-1 overflow-y-auto px-4 py-3">
            <p className="text-sm font-semibold text-ink">{text.intro}</p>
            {service.mode === "demo" && <p className="mt-0.5 text-[13px] text-ink-muted">{text.demoNote}</p>}

            <div className="mt-3 flex flex-wrap gap-2">
              {ACTIONS.map((action) => (
                <button
                  key={action.intent}
                  type="button"
                  onClick={() => void ask({ intent: action.intent, label: action.label })}
                  className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-left text-[13px] font-medium text-ink transition-colors duration-150 hover:border-brand-blue hover:bg-primary-soft focus-ring"
                >
                  {action.label}
                </button>
              ))}
            </div>

            <ol className="mt-4 flex flex-col gap-4">
              {exchanges.map((exchange) => (
                <li key={exchange.id} className="motion-rise flex flex-col gap-2">
                  <p className="self-end rounded-2xl rounded-br-md bg-primary-soft px-3 py-2 text-sm text-ink">
                    <span className="sr-only">{text.you}: </span>
                    {exchange.label}
                  </p>

                  {exchange.result.status === "thinking" && (
                    <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
                      <span aria-hidden="true" className="flex gap-1">
                        {[0, 150, 300].map((delay) => (
                          <span key={delay} className="size-1.5 animate-pulse rounded-full bg-brand-blue" style={{ animationDelay: `${delay}ms` }} />
                        ))}
                      </span>
                      {text.thinking}
                    </p>
                  )}

                  {exchange.result.status === "response" && (
                    <div className="rounded-2xl rounded-bl-md border border-line bg-canvas px-3 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{text.answer}</p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">{exchange.result.text}</p>
                      <div className="mt-2 flex gap-1 border-t border-line pt-2">
                        <Button className="px-3 py-1.5" onClick={() => void copy(exchange)}>
                          {copiedId === exchange.id ? text.copied : text.copy}
                        </Button>
                        <Button className="px-3 py-1.5" onClick={() => void ask(exchange, exchange.id)}>
                          {text.retry}
                        </Button>
                      </div>
                    </div>
                  )}

                  {exchange.result.status === "error" && (
                    <div role="alert" className="rounded-2xl rounded-bl-md border border-danger/30 bg-danger-soft px-3 py-2.5">
                      <p className="text-sm font-semibold text-danger-text">{text.errorTitle}</p>
                      <p className="mt-0.5 text-sm text-danger-text">{text.errorBody}</p>
                      <Button variant="primary" className="mt-2" onClick={() => void ask(exchange, exchange.id)}>
                        {t.common.tryAgain}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>

          <footer className="border-t border-line px-4 py-3">
            <div className="flex gap-2">
              <TextInput
                aria-label={text.askLabel}
                placeholder={text.askPlaceholder}
                value={question}
                maxLength={300}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitQuestion();
                  }
                }}
                className="py-2 text-sm"
              />
              <Button onClick={submitQuestion} disabled={!question.trim()}>
                {text.send}
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-muted">{text.privacy}</p>
          </footer>
        </section>
      )}

      <button
        ref={launcher}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={text.launch}
        onClick={() => (open ? close() : setOpen(true))}
        className={`${buttonClasses("primary")} rounded-full shadow-overlay max-sm:size-12 max-sm:p-0`}
      >
        <Sparkle />
        <span className="max-sm:hidden">{text.title}</span>
      </button>
    </div>
  );
}
