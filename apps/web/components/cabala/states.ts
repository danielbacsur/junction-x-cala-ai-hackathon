/** What Cabala is doing. A pose is a job: each state is one drawing, and reads as a still. */
export type CabalaState = "idle" | "thinking" | "reading" | "working" | "waiting" | "done" | "error" | "asleep";

export const CABALA_STATES: readonly CabalaState[] = [
  "idle",
  "thinking",
  "reading",
  "working",
  "waiting",
  "done",
  "error",
  "asleep",
];
