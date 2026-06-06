// Wire types shared between SseClient (push channel) and DebateApi (REST).
// One source of truth for what the FastAPI backend emits.

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export interface DebateEvent {
  position: number;
  agent_id: string;
  text: string;
  timestamp: number;
}

export interface DebateStatus {
  tip: number;
  topic?: string | null;
  per_agent_event_limit?: number;
  [key: string]: unknown;
}

export interface EventListResponse {
  tip: number;
  events: DebateEvent[];
}

export interface SnapshotEnvelope {
  type: "snapshot";
  events: DebateEvent[];
  status: DebateStatus;
}

export interface EventEnvelope {
  type: "event";
  event: DebateEvent;
}

// Per-agent momentum enrichment piggybacked on a summary envelope (Phase 8).
// Optional and backwards-compatible: older summaries with only text/tensions/
// convergences still work. The shape mirrors `MomentumStore.applyEnrichment`'s
// payload, with snake_case field names to match the wire convention.
export interface MomentumAdjustment {
  event_position: number;
  agent_id: string;
  delta?: number;
  takedown_blurb?: string;
}

export interface SummaryEnvelope {
  type: "summary";
  text?: string;
  tensions?: unknown[];
  convergences?: unknown[];
  as_of_position?: number;
  momentum_adjustments?: MomentumAdjustment[];
  [key: string]: unknown;
}

export interface ResetEnvelope {
  type: "reset";
  per_agent_event_limit?: number;
  [key: string]: unknown;
}

export type SseEnvelope =
  | SnapshotEnvelope
  | EventEnvelope
  | SummaryEnvelope
  | ResetEnvelope;

export interface ModeratorResponse {
  success: boolean;
  position?: number;
  error?: string;
  [key: string]: unknown;
}
