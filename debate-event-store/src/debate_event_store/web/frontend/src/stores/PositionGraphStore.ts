import { inject, injectable } from "tsyringe";
import { autorun, makeAutoObservable, runInAction, type IReactionDisposer } from "mobx";
import {
  EventStreamStore,
  TOKEN_EventStreamStore,
} from "@/views/EventStream/EventStreamStore";
import { MomentumStore, TOKEN_MomentumStore } from "@/stores/MomentumStore";
import {
  ForceSimulationService,
  TOKEN_ForceSimulationService,
  type SimNodeInput,
  type SimLinkInput,
  type SimPosition,
} from "@/services/ForceSimulationService";
import { eventType, mentionsOf } from "@/lib/eventTypes";
import type { DebateEvent } from "@/services/wireTypes";

export const TOKEN_PositionGraphStore = Symbol("PositionGraphStore");

export type EdgeKind = "rebuttal" | "concede" | "mention" | "grounding";

export interface NodeState {
  id: string;
  x: number;
  y: number;
  mass: number;
  radius: number;
}

export interface EdgeState {
  key: string;
  source: string;
  target: string;
  kind: EdgeKind;
  count: number;
  weight: number;
  mostRecentPosition: number;
}

// Age decay window: edges weaken with exp(-age/AGE_TAU_SEC). A 5-minute tau
// keeps a typical debate's worth of exchanges visible while the simulation
// loses interest in stale connections. Anything below MIN_WEIGHT is dropped
// from the link force so the layout settles around current activity.
//
// HARD_AGE_LIMIT_SEC is the absolute cutoff before an event is ignored. The
// previous value (120s) silently emptied the graph mid-debate as soon as any
// debate ran longer than two minutes — every edge dropped, and with no link
// forces the six nodes collapsed onto the centring point and looked invisible.
// One hour is comfortably longer than any realistic debate; MIN_WEIGHT cuts
// genuinely stale edges before the limit ever matters.
const AGE_TAU_SEC = 300;
const MIN_WEIGHT = 0.05;
const HARD_AGE_LIMIT_SEC = 3600;

// Node radius scaling: 8 minimum so labels remain legible; 26 cap so a hot
// node doesn't blow past the 300x280 viewport.
const RADIUS_MIN = 8;
const RADIUS_MAX = 26;

const GROUNDING_TAIL = /re:\s*#\d+\s*by\s*@([a-zA-Z][a-zA-Z0-9_]*)/i;

interface RawEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  position: number;
  ageSec: number;
}

@injectable()
export class PositionGraphStore {
  private _nodes: NodeState[] = [];
  private _edges: EdgeState[] = [];
  // Autorun disposer captured so dispose() tears down both reactions and
  // the simulation. Without this, the singleton would leak a reaction on
  // every remount and the simulation would never restart after teardown.
  private _autorunDisposer: IReactionDisposer | null = null;
  private _disposed = false;

  constructor(
    @inject(TOKEN_EventStreamStore) private readonly _stream: EventStreamStore,
    @inject(TOKEN_MomentumStore) private readonly _momentum: MomentumStore,
    @inject(TOKEN_ForceSimulationService)
    private readonly _sim: ForceSimulationService,
  ) {
    makeAutoObservable<PositionGraphStore, "_disposed" | "_autorunDisposer">(this, {
      _disposed: false,
      _autorunDisposer: false,
    });
    this._sim.onTick((positions) => this._applyPositions(positions));
    this._autorunDisposer = autorun(() => {
      // Read `_stream.tip` (a primitive that increments on every push) to
      // force a dependency MobX will reliably invalidate on. Reading
      // `_stream.events` alone tracks the field-access atom, which does NOT
      // fire when `applyEvent` mutates the array in place via push() — the
      // array reference is unchanged. The EventStream view doesn't hit this
      // bug because it reads `.length` and `events[i]` directly in observer
      // scope; this autorun would have to do the same, except the actual
      // iteration happens inside a nested `runInAction` (where tracking is
      // weaker). Tracking `tip` here is the simplest stable signal.
      const _tip = this._stream.tip;
      void _tip;
      const events = this._stream.events;
      const scores = this._momentum.currentScores;
      runInAction(() => this._rebuild(events, scores));
    });
  }

  get nodes(): readonly NodeState[] {
    return this._nodes;
  }

  get edges(): readonly EdgeState[] {
    return this._edges;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this._autorunDisposer) {
      this._autorunDisposer();
      this._autorunDisposer = null;
    }
    this._sim.dispose();
  }

  private _rebuild(
    events: readonly DebateEvent[],
    scores: Map<string, number>,
  ): void {
    const nowSec = Date.now() / 1000;
    const rawEdges = this._collectRawEdges(events, nowSec);
    const collapsed = this._collapseEdges(rawEdges);

    const activeIds = new Set<string>();
    for (const e of events) activeIds.add(e.agent_id);
    for (const r of collapsed) {
      activeIds.add(r.source);
      activeIds.add(r.target);
    }

    const prevById = new Map(this._nodes.map((n) => [n.id, n]));
    const nodes: NodeState[] = [];
    for (const id of activeIds) {
      const mass = Math.abs(scores.get(id) ?? 0);
      const radius = Math.max(
        RADIUS_MIN,
        Math.min(RADIUS_MAX, 10 + mass * 2),
      );
      const prev = prevById.get(id);
      nodes.push({
        id,
        mass,
        radius,
        x: prev?.x ?? 150,
        y: prev?.y ?? 140,
      });
    }

    this._nodes = nodes;
    this._edges = collapsed;

    const simNodes: SimNodeInput[] = nodes.map((n) => ({
      id: n.id,
      mass: n.mass,
      radius: n.radius,
    }));
    const simLinks: SimLinkInput[] = collapsed
      .filter((e) => e.weight > MIN_WEIGHT)
      .map((e) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        // Rebuttal/critique repel (long target distance); everything else
        // attracts. This is the spec's "red springs push apart, green
        // springs pull together" semantics.
        kind: e.kind === "rebuttal" ? "repel" : "attract",
      }));

    this._sim.setNodes(simNodes);
    this._sim.setLinks(simLinks);
    this._sim.bumpAlpha();
  }

  private _collectRawEdges(
    events: readonly DebateEvent[],
    nowSec: number,
  ): RawEdge[] {
    const out: RawEdge[] = [];
    for (const e of events) {
      const ageSec = Math.max(0, nowSec - e.timestamp);
      if (ageSec > HARD_AGE_LIMIT_SEC) continue;
      const t = eventType(e.text);
      const mentions = mentionsOf(e.text).filter((m) => m !== e.agent_id);

      if (t === "REBUTTAL" || t === "CRITIQUE") {
        for (const target of mentions) {
          out.push({
            source: e.agent_id,
            target,
            kind: "rebuttal",
            position: e.position,
            ageSec,
          });
        }
      } else if (t === "CONCEDE" || t === "CONVERGENCE") {
        for (const target of mentions) {
          out.push({
            source: e.agent_id,
            target,
            kind: "concede",
            position: e.position,
            ageSec,
          });
        }
      } else if (t === "GROUNDING") {
        const m = GROUNDING_TAIL.exec(e.text);
        if (m) {
          const claimAuthor = m[1];
          if (claimAuthor !== e.agent_id) {
            out.push({
              source: e.agent_id,
              target: claimAuthor,
              kind: "grounding",
              position: e.position,
              ageSec,
            });
          }
        }
        for (const target of mentions) {
          if (m && m[1] === target) continue;
          out.push({
            source: e.agent_id,
            target,
            kind: "mention",
            position: e.position,
            ageSec,
          });
        }
      } else if (mentions.length > 0) {
        for (const target of mentions) {
          out.push({
            source: e.agent_id,
            target,
            kind: "mention",
            position: e.position,
            ageSec,
          });
        }
      }
    }
    return out;
  }

  private _collapseEdges(raws: RawEdge[]): EdgeState[] {
    const byKey = new Map<string, EdgeState>();
    for (const r of raws) {
      // exp(-age/tau) yields ~0.37 at 60s, ~0.14 at 120s — see AGE_TAU_SEC.
      const w = Math.exp(-r.ageSec / AGE_TAU_SEC);
      const key = `${r.source}->${r.target}:${r.kind}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        existing.weight += w;
        if (r.position > existing.mostRecentPosition) {
          existing.mostRecentPosition = r.position;
        }
      } else {
        byKey.set(key, {
          key,
          source: r.source,
          target: r.target,
          kind: r.kind,
          count: 1,
          weight: w,
          mostRecentPosition: r.position,
        });
      }
    }
    return [...byKey.values()];
  }

  private _applyPositions(positions: SimPosition[]): void {
    if (positions.length === 0) return;
    const byId = new Map(positions.map((p) => [p.id, p]));
    let changed = false;
    const next: NodeState[] = this._nodes.map((n) => {
      const p = byId.get(n.id);
      if (!p) return n;
      if (p.x === n.x && p.y === n.y) return n;
      changed = true;
      return { ...n, x: p.x, y: p.y };
    });
    if (changed) {
      runInAction(() => {
        this._nodes = next;
      });
    }
  }
}
