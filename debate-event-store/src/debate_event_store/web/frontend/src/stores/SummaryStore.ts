import { inject, injectable } from "tsyringe";
import { makeAutoObservable, runInAction } from "mobx";
import { SseClient, TOKEN_SseClient } from "@/services/SseClient";
import type {
  MomentumAdjustment,
  SummaryEnvelope,
} from "@/services/wireTypes";
import {
  EventStreamStore,
  TOKEN_EventStreamStore,
} from "@/views/EventStream/EventStreamStore";
import { MomentumStore, TOKEN_MomentumStore } from "@/stores/MomentumStore";

export const TOKEN_SummaryStore = Symbol("SummaryStore");

export interface Tension {
  a: string;
  b: string;
  topic?: string;
}

export interface Convergence {
  agents: string[];
  topic?: string;
}

export type StrawmanKind = "VERIFIED" | "DISPUTED" | "UNSUBSTANTIATED";

export interface StrawmanFinding {
  kind: StrawmanKind;
  text: string;
  sourceEvent: number;
}

@injectable()
export class SummaryStore {
  private _currentTide: string | null = null;
  private _tensions: Tension[] = [];
  private _convergences: Convergence[] = [];
  private _lastUpdatedAt: number | null = null;
  private _asOfPosition: number | null = null;

  constructor(
    @inject(TOKEN_SseClient) sse: SseClient,
    @inject(TOKEN_EventStreamStore) private readonly _stream: EventStreamStore,
    @inject(TOKEN_MomentumStore) private readonly _momentum: MomentumStore,
  ) {
    makeAutoObservable(this);
    // Subscribe in the constructor (mirrors EventStreamStore) so the bridge
    // exists before the first envelope arrives. di.ts eagerly resolves us.
    sse.onSummary((env) => this._ingest(env));
    sse.onReset(() => this._reset());
  }

  // -- Observable getters --

  get currentTide(): string | null {
    return this._currentTide;
  }

  get tensions(): readonly Tension[] {
    return this._tensions;
  }

  get convergences(): readonly Convergence[] {
    return this._convergences;
  }

  get lastUpdatedAt(): number | null {
    return this._lastUpdatedAt;
  }

  get asOfPosition(): number | null {
    return this._asOfPosition;
  }

  /**
   * Strawman feed: pure derivation from the event log. We do NOT have the
   * summariser push this; the raw GROUNDING events are already in
   * `EventStreamStore.events`, and they're the authoritative source. The
   * panel just projects them with a kind tag.
   */
  get strawmanFeed(): readonly StrawmanFinding[] {
    const out: StrawmanFinding[] = [];
    for (const e of this._stream.events) {
      if (!/^GROUNDING:/i.test(e.text)) continue;
      let kind: StrawmanKind = "UNSUBSTANTIATED";
      if (/^GROUNDING:\s*VERIFIED/i.test(e.text)) kind = "VERIFIED";
      else if (/^GROUNDING:\s*DISPUTED/i.test(e.text)) kind = "DISPUTED";
      // Anything else (UNSUBSTANTIATED, CONTEXT, MISSING-EVIDENCE,
      // FINAL-SUMMARY) shows under the UNSUBSTANTIATED grey style; the actual
      // header word is still visible in the text.
      out.push({ kind, text: e.text, sourceEvent: e.position });
    }
    return out;
  }

  // -- Public hook (also reachable via the SSE callback path) --

  /** Drives `MomentumStore.applyEnrichment` per adjustment. Idempotent: the
   *  underlying store dedupes by (eventPosition, agentId). Exposed publicly
   *  so a test or future caller can drive it without an SSE envelope. */
  applyEnrichmentToMomentum(adjustments: readonly MomentumAdjustment[]): void {
    for (const a of adjustments) {
      this._momentum.applyEnrichment({
        eventPosition: a.event_position,
        agentId: a.agent_id,
        delta: a.delta,
        takedownBlurb: a.takedown_blurb,
      });
    }
  }

  // -- Internal SSE handlers --

  private _ingest(env: SummaryEnvelope): void {
    runInAction(() => {
      if (typeof env.text === "string") this._currentTide = env.text;
      if (Array.isArray(env.tensions)) {
        this._tensions = (env.tensions as unknown[]).filter(_isTension);
      }
      if (Array.isArray(env.convergences)) {
        this._convergences = (env.convergences as unknown[]).filter(
          _isConvergence,
        );
      }
      if (typeof env.as_of_position === "number") {
        this._asOfPosition = env.as_of_position;
      }
      this._lastUpdatedAt = Date.now();

      if (Array.isArray(env.momentum_adjustments)) {
        this.applyEnrichmentToMomentum(env.momentum_adjustments);
      }
    });
  }

  private _reset(): void {
    runInAction(() => {
      this._currentTide = null;
      this._tensions = [];
      this._convergences = [];
      this._lastUpdatedAt = null;
      this._asOfPosition = null;
    });
  }
}

function _isTension(v: unknown): v is Tension {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return typeof t.a === "string" && typeof t.b === "string";
}

function _isConvergence(v: unknown): v is Convergence {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    Array.isArray(c.agents) &&
    (c.agents as unknown[]).every((x) => typeof x === "string")
  );
}
