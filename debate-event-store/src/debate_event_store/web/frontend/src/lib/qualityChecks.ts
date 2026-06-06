import type { DebateEvent } from "@/services/wireTypes";
import { eventType, mentionsOf, type EventType } from "./eventTypes";

export interface QualityCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

// Per-target interaction breakdown for the engagements tab. Keyed counts so
// the bar-chart can stack one segment per interaction type.
export interface EngagementBreakdown {
  target: string;
  total: number;
  counts: Partial<Record<EventType, number>>;
}

export interface HeatmapCell {
  source: string;
  target: string;
  rebuttalCount: number;
  critiqueCount: number;
  concedeCount: number;
  convergeCount: number;
  mentionCount: number;
  // net = (concede + convergence) - (rebuttal + critique). Positive = green
  // (this agent yields / converges), negative = red (this agent attacks).
  net: number;
}

// ---- Quality scorecard helpers ---------------------------------------------

const FALSIFICATION_RE = /falsification\s*:/i;
const STEELMAN_RE = /steelman\s*:/i;

function buildsPositionFalsification(events: readonly DebateEvent[]): QualityCheck {
  const positions = events.filter((e) => eventType(e.text) === "POSITION");
  if (positions.length === 0) {
    return {
      id: "falsification",
      label: "POSITION includes a falsification clause",
      passed: false,
      detail: "No POSITION event published yet.",
    };
  }
  const withFalsification = positions.filter((e) => FALSIFICATION_RE.test(e.text));
  return {
    id: "falsification",
    label: "POSITION includes a falsification clause",
    passed: withFalsification.length === positions.length,
    detail:
      withFalsification.length === positions.length
        ? `${positions.length} POSITION event(s), all include "falsification:"`
        : `${withFalsification.length} of ${positions.length} POSITION event(s) include "falsification:"`,
  };
}

function buildsRebuttalSteelman(events: readonly DebateEvent[]): QualityCheck {
  const rebuttals = events.filter((e) => eventType(e.text) === "REBUTTAL");
  if (rebuttals.length === 0) {
    return {
      id: "steelman",
      label: "Every REBUTTAL opens with a Steelman",
      passed: true,
      detail: "No REBUTTAL events to check.",
    };
  }
  // Look in the first ~120 chars after the REBUTTAL token for "Steelman:".
  // Tolerant: REBUTTAL @target: Steelman: ..., or "Steelman:" on the next line.
  const passes = rebuttals.filter((e) => {
    const idx = e.text.search(/REBUTTAL\b/);
    if (idx < 0) return false;
    const window = e.text.slice(idx, idx + 200);
    return STEELMAN_RE.test(window);
  });
  return {
    id: "steelman",
    label: "Every REBUTTAL opens with a Steelman",
    passed: passes.length === rebuttals.length,
    detail: `${passes.length} of ${rebuttals.length} REBUTTAL event(s) open with "Steelman:" within ~200 chars.`,
  };
}

function buildsGroundingEngagement(
  agentId: string,
  allEvents: readonly DebateEvent[],
): QualityCheck {
  // For each GROUNDING event (regardless of author) that this agent might
  // have referenced, check whether this agent's next 2 events (chronologically
  // after the grounding) cite the grounded agent by @-mention OR include a
  // textual overlap with the GROUNDING claim (first 40 chars). A loose
  // heuristic; we'd rather false-pass than false-fail.
  const groundings = allEvents.filter((e) => eventType(e.text) === "GROUNDING");
  if (groundings.length === 0) {
    return {
      id: "grounding",
      label: "Engages with grounding events within 2 events",
      passed: true,
      detail: "No GROUNDING events to engage with.",
    };
  }
  let engagementsFound = 0;
  for (const g of groundings) {
    const groundedAgent = g.agent_id;
    if (groundedAgent === agentId) continue; // engaging with own grounding doesn't count
    const myFollowups = allEvents
      .filter((e) => e.agent_id === agentId && e.position > g.position)
      .slice(0, 2);
    if (myFollowups.length === 0) continue;
    const claimSnippet = g.text
      .replace(/^GROUNDING\s*:\s*/i, "")
      .slice(0, 40)
      .toLowerCase()
      .trim();
    for (const f of myFollowups) {
      const ft = f.text.toLowerCase();
      const mentioned = mentionsOf(f.text).includes(groundedAgent);
      const cites = claimSnippet.length > 6 && ft.includes(claimSnippet);
      if (mentioned || cites) {
        engagementsFound += 1;
        break;
      }
    }
  }
  const otherGroundings = groundings.filter((g) => g.agent_id !== agentId).length;
  if (otherGroundings === 0) {
    return {
      id: "grounding",
      label: "Engages with grounding events within 2 events",
      passed: true,
      detail: "Only own GROUNDING events present; nothing to engage with.",
    };
  }
  return {
    id: "grounding",
    label: "Engages with grounding events within 2 events",
    passed: engagementsFound > 0,
    detail: `Engaged with ${engagementsFound} of ${otherGroundings} peer GROUNDING event(s) within the next 2 own events.`,
  };
}

function buildsConcedeOrConvergence(
  agentId: string,
  allEvents: readonly DebateEvent[],
): QualityCheck {
  const mine = allEvents.filter((e) => e.agent_id === agentId);
  const yielding = mine.filter((e) => {
    const t = eventType(e.text);
    return t === "CONCEDE" || t === "CONVERGENCE";
  });
  return {
    id: "no_echo_chamber",
    label: "Has at least one CONCEDE or CONVERGENCE",
    passed: yielding.length > 0,
    detail:
      yielding.length > 0
        ? `${yielding.length} yielding event(s) published.`
        : "No CONCEDE or CONVERGENCE events published — may indicate an echo chamber.",
  };
}

function buildsCoverage(
  agentId: string,
  allEvents: readonly DebateEvent[],
): QualityCheck {
  if (allEvents.length < 3) {
    return {
      id: "coverage",
      label: "Published in each third of the debate window",
      passed: true,
      detail: "Debate has fewer than 3 events; coverage not measured.",
    };
  }
  const tsMin = allEvents[0].timestamp;
  const tsMax = allEvents[allEvents.length - 1].timestamp;
  const span = tsMax - tsMin;
  if (span <= 0) {
    return {
      id: "coverage",
      label: "Published in each third of the debate window",
      passed: true,
      detail: "All events share a timestamp; coverage not measured.",
    };
  }
  const third = span / 3;
  const mine = allEvents.filter((e) => e.agent_id === agentId);
  const buckets: [boolean, boolean, boolean] = [false, false, false];
  for (const e of mine) {
    const rel = e.timestamp - tsMin;
    const bucket = rel < third ? 0 : rel < 2 * third ? 1 : 2;
    buckets[bucket] = true;
  }
  const covered = buckets.filter(Boolean).length;
  return {
    id: "coverage",
    label: "Published in each third of the debate window",
    passed: covered === 3,
    detail: `Active in ${covered} of 3 debate thirds.`,
  };
}

export function runChecksForAgent(
  agentId: string,
  allEvents: readonly DebateEvent[],
): QualityCheck[] {
  const mine = allEvents.filter((e) => e.agent_id === agentId);
  return [
    buildsPositionFalsification(mine),
    buildsRebuttalSteelman(mine),
    buildsGroundingEngagement(agentId, allEvents),
    buildsConcedeOrConvergence(agentId, allEvents),
    buildsCoverage(agentId, allEvents),
  ];
}

// ---- Engagement breakdown --------------------------------------------------

// Count this agent's outgoing mentions, broken down by target and event type.
// Used by both the engagements tab (bar chart) and the heatmap row builder
// below — keeping the logic in one place prevents drift.
export function buildEngagements(
  source: string,
  events: readonly DebateEvent[],
): EngagementBreakdown[] {
  const byTarget = new Map<string, EngagementBreakdown>();
  for (const e of events) {
    if (e.agent_id !== source) continue;
    const t = eventType(e.text);
    const mentioned = mentionsOf(e.text);
    for (const target of mentioned) {
      if (target === source) continue;
      let row = byTarget.get(target);
      if (!row) {
        row = { target, total: 0, counts: {} };
        byTarget.set(target, row);
      }
      row.counts[t] = (row.counts[t] ?? 0) + 1;
      row.total += 1;
    }
  }
  return [...byTarget.values()].sort((a, b) => b.total - a.total);
}

// ---- Heatmap row builder ---------------------------------------------------

// Build a single row of the engagement matrix where `source` is the focused
// agent and the columns are every OTHER agent appearing in the event log
// (either as authors or as mention targets). Phase 7 renders just one row;
// the structure stays per-cell so Phase 9+ can call this in a loop to build
// the full N×N matrix without changing the cell shape.
export function buildHeatmapRow(
  source: string,
  events: readonly DebateEvent[],
): HeatmapCell[] {
  const cells = new Map<string, HeatmapCell>();
  const seenAgents = new Set<string>();
  for (const e of events) {
    seenAgents.add(e.agent_id);
    for (const m of mentionsOf(e.text)) seenAgents.add(m);
  }
  seenAgents.delete(source);

  for (const target of seenAgents) {
    cells.set(target, {
      source,
      target,
      rebuttalCount: 0,
      critiqueCount: 0,
      concedeCount: 0,
      convergeCount: 0,
      mentionCount: 0,
      net: 0,
    });
  }

  for (const e of events) {
    if (e.agent_id !== source) continue;
    const t = eventType(e.text);
    const mentioned = mentionsOf(e.text);
    for (const target of mentioned) {
      if (target === source) continue;
      const cell = cells.get(target);
      if (!cell) continue;
      if (t === "REBUTTAL") cell.rebuttalCount += 1;
      else if (t === "CRITIQUE") cell.critiqueCount += 1;
      else if (t === "CONCEDE") cell.concedeCount += 1;
      else if (t === "CONVERGENCE") cell.convergeCount += 1;
      else cell.mentionCount += 1;
    }
  }
  for (const cell of cells.values()) {
    cell.net =
      cell.concedeCount + cell.convergeCount - cell.rebuttalCount - cell.critiqueCount;
  }
  // Keep targets that have ever been mentioned or have rebuttals/concedes —
  // hide truly inert columns so the row isn't padded with zeros.
  return [...cells.values()]
    .filter(
      (c) =>
        c.rebuttalCount +
          c.critiqueCount +
          c.concedeCount +
          c.convergeCount +
          c.mentionCount >
        0,
    )
    .sort((a, b) => {
      const aTotal =
        a.rebuttalCount +
        a.critiqueCount +
        a.concedeCount +
        a.convergeCount +
        a.mentionCount;
      const bTotal =
        b.rebuttalCount +
        b.critiqueCount +
        b.concedeCount +
        b.convergeCount +
        b.mentionCount;
      if (aTotal !== bTotal) return bTotal - aTotal;
      return a.target.localeCompare(b.target);
    });
}
