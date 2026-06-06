import type { DebateEvent } from "@/services/wireTypes";
import { eventType, mentionsOf } from "@/lib/eventTypes";

export interface ScoringDelta {
  agentId: string;
  delta: number;
}

// Parse GROUNDING text shape:
//   GROUNDING: VERIFIED <claim> (re: #<pos> by @<agent>)
//   GROUNDING: DISPUTED <claim> (re: #<pos> by @<agent>)
// Returns the claim author when the tail is well-formed; otherwise null.
function groundingClaimAuthor(text: string): string | null {
  const m = /\(re:\s*#\d+\s+by\s+@([a-zA-Z][a-zA-Z0-9_]*)\)/.exec(text);
  return m ? m[1] : null;
}

function groundingVerdict(text: string): "VERIFIED" | "DISPUTED" | null {
  if (/^GROUNDING:\s*VERIFIED\b/.test(text)) return "VERIFIED";
  if (/^GROUNDING:\s*DISPUTED\b/.test(text)) return "DISPUTED";
  return null;
}

// Compute frontend-instant deltas for one event given the prior events as
// context. Context is used for the rule-compliance bonus: an event that
// engages a grounding raised within the last 2 events earns +0.5 for the
// engager. Pure function — no observables, no time, no decay.
export function computeDeltas(
  event: DebateEvent,
  context: readonly DebateEvent[],
): ScoringDelta[] {
  const out: ScoringDelta[] = [];
  const t = eventType(event.text);
  const author = event.agent_id;
  const targets = mentionsOf(event.text);

  switch (t) {
    case "REBUTTAL":
    case "CRITIQUE": {
      out.push({ agentId: author, delta: 1 });
      for (const target of targets) {
        if (target === author) continue;
        out.push({ agentId: target, delta: -1 });
      }
      break;
    }
    case "CONCEDE": {
      // CONCEDE issued: author -2; CONCEDE received: target +2.
      out.push({ agentId: author, delta: -2 });
      for (const target of targets) {
        if (target === author) continue;
        out.push({ agentId: target, delta: 2 });
      }
      break;
    }
    case "CONVERGENCE": {
      out.push({ agentId: author, delta: 0.5 });
      break;
    }
    case "GROUNDING": {
      const verdict = groundingVerdict(event.text);
      const claimAuthor = groundingClaimAuthor(event.text);
      if (verdict && claimAuthor) {
        if (verdict === "VERIFIED") out.push({ agentId: claimAuthor, delta: 0.5 });
        else out.push({ agentId: claimAuthor, delta: -1 });
      }
      break;
    }
    default:
      break;
  }

  // Rule-compliance: if author engages with a grounding event raised within
  // the last 2 events (any prior grounding in context.slice(-2)), award +0.5.
  // Only meaningful for non-grounding events; a grounding engaging itself is
  // not the engagement we mean.
  if (t !== "GROUNDING" && context.length > 0) {
    const window = context.slice(-2);
    const hasRecentGrounding = window.some((e) => eventType(e.text) === "GROUNDING");
    if (hasRecentGrounding) {
      out.push({ agentId: author, delta: 0.5 });
    }
  }

  return out;
}
