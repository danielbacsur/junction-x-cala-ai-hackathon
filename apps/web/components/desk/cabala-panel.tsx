"use client";

import { APPROVE_OPTION_ID, DENY_OPTION_ID } from "eve/events";
import type { Interaction } from "eve/react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Cabala } from "@/components/cabala/cabala";
import type { CabalaStatus } from "@/components/cabala/status";
import type { CabalaSession, Trouble } from "@/components/desk/session";
import { Button } from "@/components/ui/button";
import { formatElapsed } from "@/lib/format";

import { ChatMarkdown } from "./chat-markdown";

/** Trouble is reported in words, in Cabala's voice, with what is still safe and what to do next. */
const TROUBLE: Record<Trouble, string> = {
  start:
    "I could not be reached to start on this mandate. It is saved, and I start as soon as the connection is back.",
  send: "I can't be reached right now, so that instruction did not arrive. Everything on this page is stored and still open.",
  answer:
    "I can't be reached right now, so your answer did not arrive. Nothing was decided.",
  stream:
    "I lost the connection to this session. The work log is still the record of what was done.",
};

/**
 * Cabala's latest words. A turn speaks in several parts, a line before it starts work and its
 * account afterwards, so the newest part that says something is the one shown.
 */
function textOf(session: CabalaSession): string | null {
  for (const message of session.messages.toReversed()) {
    if (message.role !== "assistant") continue;

    for (const part of message.parts.toReversed()) {
      const text = part.type === "text" ? part.text.trim() : "";

      if (text) return text;
    }
  }

  return null;
}

/**
 * One question or approval from Cabala. Until it is answered here the turn stays open, so every
 * kind is answerable from its common fields: its options, free text, or both.
 */
function Ask({
  ask,
  disabled,
  onAnswer,
}: {
  ask: Interaction;
  disabled: boolean;
  onAnswer: (value: { optionId?: string; text?: string }) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const id = useId();

  const { request } = ask;
  const approval = request.kind === "approval";

  const options =
    request.options && request.options.length > 0
      ? request.options
      : approval
        ? [
            {
              id: APPROVE_OPTION_ID,
              label: "Approve",
              style: "primary" as const,
            },
            {
              id: DENY_OPTION_ID,
              label: "Do not approve",
              style: "default" as const,
            },
          ]
        : [];

  const freeform =
    request.allowFreeform || request.display === "text" || options.length === 0;

  async function answer(value: { optionId?: string; text?: string }) {
    setSending(true);
    await onAnswer(value);
    setSending(false);
  }

  if (request.kind === "sign-in") {
    return (
      <div className="rounded-2xl bg-yellow-tint px-4 py-3 text-sm">
        <p className="font-demi">
          {request.signIn?.displayName ??
            request.signIn?.name ??
            "A connection"}{" "}
          needs you to sign in
        </p>
        <p className="mt-1 text-ink-2">
          {request.signIn?.instructions ?? request.prompt}
        </p>
        {request.signIn?.userCode && (
          <p className="mt-1 font-mono">{request.signIn.userCode}</p>
        )}
        {request.signIn?.url && (
          <a
            href={request.signIn.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block font-medium underline underline-offset-2"
          >
            Sign in
          </a>
        )}
      </div>
    );
  }

  return (
    <fieldset
      disabled={disabled || sending}
      className="min-w-0 rounded-2xl bg-yellow-tint px-4 py-3.5 [overflow-wrap:anywhere] shadow-[0_0_0_1.5px_var(--color-ink)]"
    >
      <legend className="float-left mb-1.5 w-full text-[0.6875rem] font-medium tracking-wide text-ink-2 uppercase">
        {approval
          ? "Needs your approval"
          : request.kind === "budget"
            ? "Needs your go-ahead"
            : "Question for you"}
      </legend>

      {request.title && (
        <p className="clear-both font-demi tracking-tight">{request.title}</p>
      )}
      <p className="clear-both text-sm whitespace-pre-line">{request.prompt}</p>

      {approval && ask.call && (
        <details className="mt-2 text-meta text-ink-2">
          <summary className="w-fit rounded-sm">What this would run</summary>
          <p className="mt-1 font-mono text-[0.6875rem] break-all">
            {ask.call.name}
            {ask.call.input !== undefined
              ? ` ${JSON.stringify(ask.call.input)}`
              : ""}
          </p>
        </details>
      )}

      {request.link && (
        <a
          href={request.link.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm font-medium underline underline-offset-2"
        >
          {request.link.label ?? request.link.url}
        </a>
      )}

      {options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((option) => {
            const leading =
              option.style === "primary" || option.id === APPROVE_OPTION_ID;

            return (
              <Button
                key={option.id}
                size="small"
                variant="secondary"
                title={option.description}
                onClick={() => answer({ optionId: option.id })}
                className={leading ? "bg-ink! text-card! hover:bg-ink/85!" : ""}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      )}

      {freeform && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (text.trim()) void answer({ text: text.trim() });
          }}
        >
          <label htmlFor={id} className="sr-only">
            Your answer
          </label>
          <input
            id={id}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Your answer"
            autoComplete="off"
            className="h-9 min-w-0 flex-1 rounded-full bg-card px-3.5 text-sm shadow-hairline placeholder:text-ink-3"
          />
          <Button
            type="submit"
            size="small"
            variant="secondary"
            disabled={!text.trim()}
          >
            Answer
          </Button>
        </form>
      )}

      {sending && (
        <p role="status" className="mt-2 text-meta text-ink-2">
          Sending your answer
        </p>
      )}
    </fieldset>
  );
}

/**
 * Cabala on the Desk: what it is doing, anything it needs from the customer, and a box for
 * instructions. The main conversation always shows the full animated figure. The evidence
 * desk uses a bust between moments that need the customer's attention.
 */
export function CabalaPanel({
  status,
  session,
  moment,
  now,
  prominent = false,
}: {
  prominent?: boolean;
  status: CabalaStatus;
  session: CabalaSession;
  /** True when the full figure should stand: the brief just in, a question, the list delivered. */
  moment: boolean;
  now: number;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const id = useId();

  const said = textOf(session);
  const transcript = session.messages.flatMap((message, index) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    return text && !/^Begin mandate /.test(text)
      ? [{ key: index, role: message.role, text }]
      : [];
  });
  const conversation = useRef<HTMLDivElement>(null);
  const followConversation = useRef(true);
  const lastText = transcript.at(-1)?.text;
  useEffect(() => {
    if (prominent && conversation.current && followConversation.current)
      conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [prominent, lastText, transcript.length]);
  const elapsed = status.since
    ? formatElapsed((now - new Date(status.since).getTime()) / 1000)
    : null;
  const running =
    status.state === "reading" ||
    status.state === "working" ||
    status.state === "thinking";
  const full =
    prominent ||
    moment ||
    status.state === "waiting" ||
    status.state === "done" ||
    status.state === "error";

  async function send(event: FormEvent) {
    event.preventDefault();

    const text = draft.trim();
    if (!text || sending) return;

    followConversation.current = true;
    setSending(true);
    if (await session.send(text)) setDraft("");
    setSending(false);
  }

  return (
    <section
      id="cabala"
      aria-labelledby="cabala-title"
      className={`scroll-mt-4 overflow-hidden rounded-card bg-card ${prominent ? "shadow-lift" : "shadow-hairline"}`}
    >
      {prominent && (
        <div className="flex items-center justify-between bg-ink px-5 py-3 text-card">
          <span className="text-sm font-medium">Your conversation</span>
          <span className="text-xs text-card/70">
            Cabala · Fundraising agent
          </span>
        </div>
      )}
      {full ? (
        <div className="flex justify-center bg-paper-deep/60 py-2">
          <Cabala state={status.state} size={220} />
        </div>
      ) : null}

      <div className="p-5">
        <div className="flex items-center gap-3">
          {!full && <Cabala state={status.state} variant="bust" size={44} />}
          <div className="min-w-0">
            <h2 id="cabala-title" className="font-demi tracking-tight">
              Cabala{" "}
              <span className="font-normal text-ink-2">
                · Fundraising agent
              </span>
            </h2>
            <p role="status" aria-live="polite" className="text-sm">
              <span className={running ? "running-text" : "text-ink-2"}>
                {status.label}
              </span>
              {elapsed && (
                <span className="text-ink-3 tabular-nums"> · {elapsed}</span>
              )}
            </p>
          </div>
        </div>

        {session.failure && (
          <p
            role="alert"
            className="mt-4 rounded-2xl bg-orange-tint px-4 py-3 text-sm"
          >
            That turn stopped with an error, and nothing in the list was changed
            by it. Tell me to try again.
            <span className="mt-1 block font-mono text-[0.6875rem] break-words text-ink-2">
              {session.failure}
            </span>
          </p>
        )}

        {session.trouble && (
          <div
            role="alert"
            className="mt-4 rounded-2xl bg-orange-tint px-4 py-3 text-sm"
          >
            <p>{TROUBLE[session.trouble]}</p>
            <button
              type="button"
              onClick={session.retry}
              className="mt-1.5 rounded-sm font-medium underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        {session.asks.length > 0 && (
          <div className="mt-4 grid gap-3">
            {session.asks.map((ask) => (
              <Ask
                key={ask.interactionId}
                ask={ask}
                disabled={session.resuming}
                onAnswer={(value) => session.answer(ask.interactionId, value)}
              />
            ))}
          </div>
        )}

        {prominent && (
          <div
            ref={conversation}
            onScroll={(event) => {
              const view = event.currentTarget;
              followConversation.current =
                view.scrollHeight - view.scrollTop - view.clientHeight < 64;
            }}
            role="log"
            aria-label="Conversation history"
            className="mt-5 flex max-h-80 min-h-44 flex-col gap-4 overflow-y-auto overscroll-contain pr-1 sm:min-h-48"
          >
            {transcript.length === 0 ? (
              <div className="my-auto px-2 py-6">
                <p className="text-lg font-demi tracking-tight">
                  Let’s find your next conversation.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">
                  Tell me what matters for this round. I’ll use your brief to
                  find connections, explain the evidence, and help you prepare.
                </p>
              </div>
            ) : (
              transcript.map((message) => (
                <div
                  key={message.key}
                  className={
                    message.role === "user"
                      ? "ml-8 min-w-0 max-w-[calc(100%-2rem)] self-end"
                      : "mr-3 min-w-0 max-w-[calc(100%-0.75rem)] self-start"
                  }
                >
                  <p className="mb-1.5 text-[0.6875rem] font-medium text-ink-3">
                    {message.role === "user" ? "You" : "Cabala"}
                  </p>
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed [overflow-wrap:anywhere] ${message.role === "user" ? "rounded-tr-sm bg-ink text-card" : "rounded-tl-sm bg-paper/65"}`}
                  >
                    <ChatMarkdown text={message.text} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {!prominent && said && (
          <div className="mt-4">
            <div className="max-h-48 overflow-y-auto rounded-2xl rounded-tl-md bg-paper/70 px-4 py-3 text-sm [overflow-wrap:anywhere]">
              <ChatMarkdown text={said} />
            </div>
            <p className="mt-1.5 text-[0.6875rem] text-ink-3">
              Cabala&rsquo;s words are commentary. The record is the list, the
              trails and the work log.
            </p>
          </div>
        )}

        {prominent && (
          <div
            className="mt-4 flex flex-wrap gap-1.5"
            aria-label="Suggested messages"
          >
            {[
              "Explain the strongest connection",
              "What is still unknown?",
              "Refine my criteria",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setDraft(prompt);
                  document.getElementById(id)?.focus();
                }}
                className="rounded-full bg-wash px-3 py-2 text-xs text-ink-2 transition-colors hover:bg-yellow-tint"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={send} className="mt-5 border-t border-line pt-4">
          <label htmlFor={id} className="text-sm font-medium">
            Message Cabala
          </label>
          <div className="mt-1.5 flex items-end gap-2 rounded-2xl bg-paper/70 p-2 pl-4 transition-colors focus-within:bg-yellow-tint">
            <textarea
              id={id}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                )
                  void send(event);
              }}
              rows={2}
              disabled={session.resuming}
              placeholder="Ask about a connection, refine your brief…"
              className="quiet-input min-h-14 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm placeholder:text-ink-3"
            />
            <Button
              type="submit"
              size="small"
              disabled={!draft.trim() || sending || session.resuming}
              aria-label="Send the instruction"
            >
              {sending ? "Sending" : "Send"}
            </Button>
          </div>
          <p className="mt-1.5 text-[0.6875rem] text-ink-3">
            {session.resuming
              ? "Catching up with the session. Sending opens in a moment."
              : "Enter to send · Shift + Enter for a new line"}
          </p>
        </form>
      </div>
    </section>
  );
}
