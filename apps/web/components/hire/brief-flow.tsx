"use client";
import { useActionState, useState } from "react";
import type { EntityMatch, Role } from "@fundraising/package-ledger";
import { hire } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function BriefFlow() {
  const [brief, setBrief] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [matches, setMatches] = useState<EntityMatch[]>([]);
  const [resolving, setResolving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [state, action, pending] = useActionState(hire, { error: null });
  async function resolve(form: FormData) {
    setResolving(true);
    setError("");
    setMatches([]);
    const words = brief.toLowerCase();
    if (/\b(raising|raise|founder)\b/.test(words)) setRole("founder");
    else if (/\b(investing|investor|fund|portfolio)\b/.test(words))
      setRole("investor");
    const name = String(form.get("entity") ?? "").trim();
    setSubmitted(true);
    if (!name) {
      setResolving(false);
      return;
    }
    try {
      const response = await fetch(
        `/api/entities?q=${encodeURIComponent(name)}`,
      );
      if (!response.ok)
        throw new Error("Entity search is unavailable. Try again shortly.");
      const result = await response.json();
      setMatches(result.matches);
      if (!result.matches.length)
        setError("No match found. Try the company or fund's full name.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search failed.");
    } finally {
      setResolving(false);
    }
  }
  return (
    <div>
      <p className="mb-5 text-sm leading-relaxed text-ink-2">
        What are you raising or investing in, and who would you like to meet? A
        sentence is enough to start.
      </p>
      <form action={resolve} className="space-y-5">
        <label className="block text-sm font-medium" htmlFor="brief">
          Your brief
        </label>
        <textarea
          id="brief"
          required
          maxLength={2000}
          value={brief}
          onChange={(e) => {
            setBrief(e.target.value);
            setSubmitted(false);
            setMatches([]);
            setRole("");
          }}
          placeholder="We're raising a seed round for a Finnish climate company. Who should we meet?"
          className="quiet-input min-h-36 w-full resize-y rounded-2xl bg-paper/60 p-4 text-base leading-relaxed placeholder:text-ink-3 transition-colors focus:bg-yellow-tint"
        />
        {submitted && (
          <>
            <label className="block text-sm">
              Which company or fund are you with?
              <input
                name="entity"
                required
                className="quiet-input mt-2 block w-full rounded-xl bg-paper/60 p-3 transition-colors focus:bg-yellow-tint"
                placeholder="Company or fund name"
              />
            </label>
            {!role && (
              <label className="block text-sm">
                Are you raising or investing?
                <select
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="ml-3 rounded-card bg-card p-2"
                >
                  <option value="">Choose your role</option>
                  <option value="founder">Raising</option>
                  <option value="investor">Investing</option>
                </select>
              </label>
            )}
          </>
        )}
        <Button type="submit" disabled={resolving}>
          {resolving
            ? "Finding your entity…"
            : submitted
              ? "Find my company or fund"
              : "Brief Cabala"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-4 text-sm">
          {error}
        </p>
      )}
      {!submitted && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[0.6875rem] font-medium tracking-wide text-ink-3 uppercase">
            Try a starting point
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              [
                "I’m raising",
                "We’re raising a seed round for a Finnish climate company. Which investors should we meet?",
              ],
              [
                "I’m investing",
                "We’re investing in early-stage European software companies. Who should we meet at Slush?",
              ],
            ].map(([label, text]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setBrief(text);
                  setRole("");
                  document.getElementById("brief")?.focus();
                }}
                className="rounded-full bg-wash px-3 py-2 text-xs text-ink-2 hover:bg-yellow-tint"
              >
                {label} ↗
              </button>
            ))}
          </div>
        </div>
      )}
      {matches.length > 0 && role && (
        <form action={action} className="mt-5 flex flex-col items-start gap-3">
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="notes" value={brief} />
          <p className="text-sm text-ink-2">Choose your entity to start.</p>
          {matches.map((entity) => (
            <Button
              key={entity.id}
              type="submit"
              name="subjectId"
              value={entity.id}
              disabled={pending}
              variant="secondary"
            >
              {entity.name}
            </Button>
          ))}
          {state.error && <p role="alert">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
