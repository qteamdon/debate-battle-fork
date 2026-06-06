export type EventType =
  | "POSITION"
  | "ARGUMENT"
  | "REBUTTAL"
  | "CONCEDE"
  | "CRITIQUE"
  | "CONVERGENCE"
  | "GROUNDING"
  | "ROLE"
  | "MODERATOR"
  | "OTHER";

export const ALL_EVENT_TYPES: readonly EventType[] = [
  "POSITION",
  "ARGUMENT",
  "REBUTTAL",
  "CONCEDE",
  "CRITIQUE",
  "CONVERGENCE",
  "GROUNDING",
  "ROLE",
  "MODERATOR",
];

const PATTERNS: Array<[EventType, RegExp]> = [
  ["POSITION", /^POSITION:/],
  ["ARGUMENT", /^ARGUMENT:/],
  ["REBUTTAL", /^REBUTTAL\b/],
  ["CONCEDE", /^CONCEDE\b/],
  ["CRITIQUE", /^CRITIQUE\b/],
  ["CONVERGENCE", /^CONVERGENCE:/],
  ["GROUNDING", /^GROUNDING:/],
  ["ROLE", /^ROLE:/],
  ["MODERATOR", /^MODERATOR:/],
];

export function eventType(text: string): EventType {
  for (const [t, re] of PATTERNS) if (re.test(text)) return t;
  return "OTHER";
}

export function mentionsOf(text: string): string[] {
  const out = new Set<string>();
  const re = /@([a-zA-Z][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[1]);
  return [...out];
}

// Single source of truth for type→colour. Both the legend chip swatch and
// the stream row stripe must read from here so they cannot drift.
export const TYPE_COLOR: Record<EventType, string> = {
  POSITION: "#4f9eff",
  ARGUMENT: "#38d9c4",
  REBUTTAL: "#ff6b6b",
  CRITIQUE: "#ffb547",
  CONCEDE: "#51cf66",
  CONVERGENCE: "#c084fc",
  GROUNDING: "#a78bfa",
  ROLE: "#94a3b8",
  MODERATOR: "#ec4899",
  OTHER: "#5a6275",
};
