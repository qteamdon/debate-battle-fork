import { inject, injectable } from "tsyringe";
import { autorun, makeAutoObservable, runInAction } from "mobx";
import {
  EventStreamStore,
  TOKEN_EventStreamStore,
} from "@/views/EventStream/EventStreamStore";
import { computeDeltas } from "@/lib/momentumScoring";
import type { DebateEvent } from "@/services/wireTypes";

export const TOKEN_MomentumStore = Symbol("MomentumStore");

// Decay-at-read-time keeps raw deltas authoritative; the chart applies decay
// when generating series so enrichment / replay never mutate history.
const DECAY_PER_MS = Math.log(0.98) / 60000;

// Takedown threshold: any single event whose summed delta on a target is
// <= -1.5 emits a takedown marker for that target. Tuned for the rules table
// — a REBUTTAL alone (-1) is not a takedown; a CONCEDE issued (-2) is.
const TAKEDOWN_THRESHOLD = -1.5;

export interface MomentumEntry {
  eventPosition: number;
  agentId: string;
  delta: number;
  timestamp: number;
  kind: "instant" | "enrichment";
}

export interface Takedown {
  eventPosition: number;
  agentId: string;
  timestamp: number;
  severity: number;
  blurb?: string;
}

export interface MomentumPoint {
  t: number;
  score: number;
  eventPosition: number;
}

export interface EnrichmentPayload {
  eventPosition: number;
  agentId: string;
  delta?: number;
  takedownBlurb?: string;
}

@injectable()
export class MomentumStore {
  private _entries: MomentumEntry[] = [];
  private _takedowns: Takedown[] = [];
  private _lastSeenPosition = 0;

  constructor(
    @inject(TOKEN_EventStreamStore) private readonly _stream: EventStreamStore,
  ) {
    // _lastSeenPosition is excluded from observability: the autorun reads
    // _stream.events and writes _lastSeenPosition, so making the cursor
    // observable would cause a self-triggered re-run loop. The cursor is
    // implementation detail; it never needs to drive a view.
    makeAutoObservable<MomentumStore, "_lastSeenPosition">(this, {
      _lastSeenPosition: false,
    });
    autorun(() => {
      // See PositionGraphStore for the rationale: read `_stream.tip` (a
      // primitive that increments on every push) so MobX reliably invalidates
      // this autorun when a new event lands. Tracking the array reference
      // alone is not enough — push() mutates in place and doesn't fire the
      // field-access atom.
      const _tip = this._stream.tip;
      void _tip;
      const events = this._stream.events;
      runInAction(() => this._catchUp(events));
    });
  }

  private _catchUp(events: readonly DebateEvent[]): void {
    // Reset signal: stream cleared. Drop everything and rewind.
    if (events.length === 0) {
      if (this._lastSeenPosition !== 0 || this._entries.length > 0) {
        this._entries = [];
        this._takedowns = [];
        this._lastSeenPosition = 0;
      }
      return;
    }
    // If the stream's tip rewound below our cursor it's also a reset/replay.
    const tipPos = events[events.length - 1].position;
    if (tipPos < this._lastSeenPosition) {
      this._entries = [];
      this._takedowns = [];
      this._lastSeenPosition = 0;
    }
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.position <= this._lastSeenPosition) continue;
      // computeDeltas only consults the last 2 prior events for the
      // grounding-engagement bonus, so a 2-event slice is enough context.
      const context = events.slice(Math.max(0, i - 2), i);
      this._applyEventInstant(e, context);
      this._lastSeenPosition = e.position;
    }
  }

  private _applyEventInstant(
    e: DebateEvent,
    context: readonly DebateEvent[],
  ): void {
    const deltas = computeDeltas(e, context);
    if (deltas.length === 0) return;

    // Aggregate per-agent so a single event produces a single entry per
    // agent. Required for takedown detection (sum the net delta for this
    // event before thresholding).
    const perAgent = new Map<string, number>();
    for (const d of deltas) {
      perAgent.set(d.agentId, (perAgent.get(d.agentId) ?? 0) + d.delta);
    }
    for (const [agentId, delta] of perAgent) {
      if (delta === 0) continue;
      this._entries.push({
        eventPosition: e.position,
        agentId,
        delta,
        timestamp: e.timestamp,
        kind: "instant",
      });
      if (delta <= TAKEDOWN_THRESHOLD) {
        this._takedowns.push({
          eventPosition: e.position,
          agentId,
          timestamp: e.timestamp,
          severity: delta,
        });
      }
    }
  }

  applyEnrichment(payload: EnrichmentPayload): void {
    if (typeof payload.delta === "number" && payload.delta !== 0) {
      // Dedupe by (eventPosition, agentId): a Phase-8 summary that arrives
      // twice for the same takedown should not double-count momentum. We
      // replace rather than append, so the latest haiku judgement wins.
      const existing = this._entries.findIndex(
        (en) =>
          en.kind === "enrichment" &&
          en.eventPosition === payload.eventPosition &&
          en.agentId === payload.agentId,
      );
      const anchor = this._entries.find(
        (en) => en.eventPosition === payload.eventPosition,
      );
      const ts = anchor?.timestamp ?? Date.now() / 1000;
      const entry = {
        eventPosition: payload.eventPosition,
        agentId: payload.agentId,
        delta: payload.delta,
        timestamp: ts,
        kind: "enrichment" as const,
      };
      if (existing >= 0) this._entries[existing] = entry;
      else this._entries.push(entry);
    }
    if (payload.takedownBlurb) {
      const td = this._takedowns.find(
        (x) =>
          x.eventPosition === payload.eventPosition &&
          x.agentId === payload.agentId,
      );
      if (td) {
        td.blurb = payload.takedownBlurb;
      }
    }
  }

  get entries(): readonly MomentumEntry[] {
    return this._entries;
  }

  get takedowns(): readonly Takedown[] {
    return this._takedowns;
  }

  // Per-agent cumulative score over time with decay applied relative to now.
  // Raw deltas remain untouched in _entries; this is a read-time projection.
  series(now: number): Map<string, MomentumPoint[]> {
    const byAgent = new Map<string, MomentumEntry[]>();
    for (const e of this._entries) {
      let list = byAgent.get(e.agentId);
      if (!list) {
        list = [];
        byAgent.set(e.agentId, list);
      }
      list.push(e);
    }
    const out = new Map<string, MomentumPoint[]>();
    const nowMs = now;
    for (const [agentId, entries] of byAgent) {
      entries.sort((a, b) => a.timestamp - b.timestamp || a.eventPosition - b.eventPosition);
      const points: MomentumPoint[] = [];
      let acc = 0;
      for (const en of entries) {
        const ageMs = Math.max(0, nowMs - en.timestamp * 1000);
        const factor = Math.exp(DECAY_PER_MS * ageMs);
        acc += en.delta * factor;
        points.push({ t: en.timestamp, score: acc, eventPosition: en.eventPosition });
      }
      out.set(agentId, points);
    }
    return out;
  }

  get currentScores(): Map<string, number> {
    const nowSec = Date.now() / 1000;
    const map = new Map<string, number>();
    for (const e of this._entries) {
      const ageMs = Math.max(0, (nowSec - e.timestamp) * 1000);
      const factor = Math.exp(DECAY_PER_MS * ageMs);
      map.set(e.agentId, (map.get(e.agentId) ?? 0) + e.delta * factor);
    }
    return map;
  }

  get topAgents(): string[] {
    const scores = this.currentScores;
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([id]) => id);
  }
}
