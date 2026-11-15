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
    setResolving(true); setError(""); setMatches([]);
    const words = brief.toLowerCase();
    if (/\b(raising|raise|founder)\b/.test(words)) setRole("founder");
    else if (/\b(investing|investor|fund|portfolio)\b/.test(words)) setRole("investor");
    const name = String(form.get("entity") ?? "").trim();
    setSubmitted(true);
    if (!name) { setResolving(false); return; }
    try {
      const response = await fetch(`/api/entities?q=${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error("Entity search is unavailable. Try again shortly.");
      const result = await response.json(); setMatches(result.matches);
      if (!result.matches.length) setError("No match found. Try the company or fund's full name.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Search failed."); }
    finally { setResolving(false); }
  }
  return <div className="max-w-2xl">
    <form action={resolve} className="space-y-5">
      <label className="block text-sm font-medium" htmlFor="brief">What are you working towards?</label>
      <textarea id="brief" required maxLength={2000} value={brief} onChange={(e) => { setBrief(e.target.value); setSubmitted(false); setMatches([]); setRole(""); }}
        placeholder="We're raising a seed round for a Finnish climate company. Who should we meet?"
        className="min-h-32 w-full rounded-panel bg-card p-5 text-lede shadow-hairline" />
      {submitted && <><label className="block text-sm">Which company or fund are you with?
        <input name="entity" required className="mt-2 block w-full rounded-card bg-card p-3 shadow-hairline" placeholder="Company or fund name" />
      </label>{!role && <label className="block text-sm">Are you raising or investing?
        <select required value={role} onChange={(e) => setRole(e.target.value as Role)} className="ml-3 rounded-card bg-card p-2">
          <option value="">Choose your role</option><option value="founder">Raising</option><option value="investor">Investing</option>
        </select></label>}</>}
      <Button type="submit" disabled={resolving}>{resolving ? "Finding your entity…" : submitted ? "Find my company or fund" : "Brief Cabala"}</Button>
    </form>
    {error && <p role="alert" className="mt-4 text-sm">{error}</p>}
    {matches.length > 0 && role && <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="role" value={role} /><input type="hidden" name="notes" value={brief} />
      <p className="text-sm text-ink-2">Choose your entity to start.</p>
      {matches.map((entity) => <Button key={entity.id} type="submit" name="subjectId" value={entity.id} disabled={pending} variant="secondary">{entity.name}</Button>)}
      {state.error && <p role="alert">{state.error}</p>}
    </form>}
  </div>;
}
