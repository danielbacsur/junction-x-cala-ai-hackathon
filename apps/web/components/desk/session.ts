"use client";

import { activeTurn, activity, call, calls, failure, openInteractions, showsActivity, turns } from "eve/events";
import { useEveAgent, type EveMessage, type Interaction } from "eve/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { attachSession } from "@/app/m/[id]/actions";
import type { Stream } from "@/components/cabala/status";

/** Why Cabala cannot be heard from right now, in the customer's terms. */
export type Trouble = "start" | "send" | "answer" | "stream";

export type CabalaSession = {
  stream: Stream;
  /** The conversation so far, without the line that opened the mandate. */
  messages: readonly EveMessage[];
  /** Questions and approvals that still wait for an answer. */
  asks: readonly Interaction[];
  /** True while the session is catching up; nothing can be sent or answered then. */
  resuming: boolean;
  busy: boolean;
  trouble: Trouble | null;
  /** What a failed turn reported, when the stream carried one. */
  failure: string | null;
  send: (text: string) => Promise<boolean>;
  answer: (interactionId: string, value: { optionId?: string; text?: string }) => Promise<boolean>;
  retry: () => void;
};

const opening = (mandateId: string) => `Begin mandate ${mandateId}.`;

/**
 * The mandate's one eve session with Cabala. The first load of a mandate starts it and records
 * its ID in the ledger; every later load resumes it. The stream tells the Desk whether a turn is
 * running and whether it waits on the customer. It is commentary: facts come from the ledger.
 */
export function useCabalaSession({
  mandateId,
  sessionId,
  onTurnEnd,
}: {
  mandateId: string;
  sessionId: string | null;
  onTurnEnd: () => void;
}): CabalaSession {
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);

  const begun = useRef(sessionId !== null);
  const attached = useRef(sessionId);

  const agent = useEveAgent({
    agent: "cabala",
    initialSession: sessionId ? { sessionId, streamIndex: 0 } : undefined,
    resume: sessionId !== null,

    onSessionChange(session) {
      if (!session || attached.current === session.sessionId) return;

      attached.current = session.sessionId;

      void attachSession(mandateId, session.sessionId).then((bound) => {
        // Another tab opened the mandate first; its session is the mandate's.
        if (bound.sessionId && bound.sessionId !== session.sessionId) window.location.reload();
      });
    },

    onFinish() {
      setFinishedAt(Date.now());
      onTurnEnd();
    },

    onError() {
      setTrouble((current) => current ?? "stream");
    },
  });

  function start() {
    agent.send(opening(mandateId)).then(
      () => setTrouble(null),
      () => setTrouble("start"),
    );
  }

  const begin = useEffectEvent(start);

  // Strict mode mounts everything twice, but a mandate is begun once.
  useEffect(() => {
    if (begun.current) return;

    begun.current = true;
    begin();
  }, []);

  const { view } = agent;
  const asks = openInteractions(view).filter((ask) => ask.answer === undefined);
  const last = turns(view).at(-1);
  const failed = last ? failure(view, last.turnId) : failure(view);
  const now = activity(view);

  let stream: Stream;

  if (asks.length > 0 || now.kind === "waiting-on-interaction") stream = { kind: "needs-you" };
  else if (now.kind === "calling") {
    // The activity summary carries display labels; the pose is chosen by the tools' own names.
    const turn = activeTurn(view);
    const running = turn ? calls(view, { turnId: turn.turnId }).filter((item) => item.state === "running" && showsActivity(item)) : [];

    stream = {
      kind: "calling",
      names: running.length > 0 ? running.map((item) => item.name) : now.names,
      started: running.find((item) => item.startedAt)?.startedAt ?? null,
    };
  }
  else if (now.kind === "waiting-on-tasks") {
    stream = { kind: "calling", names: now.tasks.flatMap((task) => call(view, task.callId)?.name ?? []) };
  } else if (now.kind === "thinking" || now.kind === "compacting") {
    const writing = agent.messages.at(-1)?.parts.some((part) => part.type === "text" && part.state === "streaming");

    stream = { kind: writing ? "writing" : "thinking" };
  } else if (failed && last?.status === "settled") stream = { kind: "failed" };
  else if (trouble || agent.error || !agent.session) stream = { kind: "offline" };
  else if (finishedAt !== null) stream = { kind: "finished", at: finishedAt };
  else stream = { kind: "idle" };

  return {
    stream,
    messages: agent.messages.filter(
      (message) => !(message.role === "user" && message.parts.some((part) => part.type === "text" && part.text === opening(mandateId))),
    ),
    asks,
    resuming: agent.status === "resuming",
    busy: agent.status === "busy",
    trouble: trouble ?? (agent.error && !failed ? "stream" : null),
    failure: failed?.message ?? null,

    async send(text) {
      try {
        await agent.send(text);
        setTrouble(null);

        return true;
      } catch {
        setTrouble("send");

        return false;
      }
    },

    async answer(interactionId, value) {
      try {
        await agent.respond([{ interactionId, ...value }]);
        setTrouble(null);

        return true;
      } catch {
        setTrouble("answer");

        return false;
      }
    },

    retry() {
      setTrouble(null);

      if (agent.session) void agent.resume().catch(() => setTrouble("stream"));
      else start();
    },
  };
}
