import { injectable } from "tsyringe";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
  type ForceLink,
} from "d3-force";

export const TOKEN_ForceSimulationService = Symbol("ForceSimulationService");

export interface SimNodeInput {
  id: string;
  mass: number;
  radius: number;
}

export interface SimLinkInput {
  source: string;
  target: string;
  weight: number;
  // "attract" pulls nodes together (concede/converge/grounding/mention);
  // "repel" pushes them apart (rebuttal/critique). Implemented as a single
  // forceLink with kind-dependent target distance — repel links have a
  // very long target distance so the spring's restoring force separates.
  kind: "attract" | "repel";
}

export interface SimPosition {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// Internal mutable node carries x/y/vx/vy that d3 writes onto. We never expose
// these refs outside the service: each tick we copy positions into a fresh
// array so MobX observers see a new value, not a mutated one.
interface InternalNode extends SimulationNodeDatum {
  id: string;
  mass: number;
  radius: number;
}

interface InternalLink extends SimulationLinkDatum<InternalNode> {
  weight: number;
  kind: "attract" | "repel";
}

type TickHandler = (positions: SimPosition[]) => void;

@injectable()
export class ForceSimulationService {
  private _sim: Simulation<InternalNode, InternalLink> | null = null;
  private _nodes: InternalNode[] = [];
  private _links: InternalLink[] = [];
  private _onTick: TickHandler | null = null;
  // The viewport is fixed at 300x280 in Phase 6; centring forces pull nodes
  // toward this point. We do not yet expose a setter — change here if the
  // rail width changes.
  private _centerX = 150;
  private _centerY = 140;

  start(nodes: SimNodeInput[], links: SimLinkInput[]): void {
    this._buildNodes(nodes);
    this._buildLinks(links);

    const linkForce = forceLink<InternalNode, InternalLink>(this._links)
      .id((d) => d.id)
      .distance((l) => {
        // Repel links target a distance well beyond the 300x280 viewport so
        // the spring's restoring force pushes nodes apart. Attract links
        // target a short, weight-modulated distance so heavier conflicts
        // collapse tighter (concedes "snap" together).
        if (l.kind === "repel") return 220 + l.weight * 30;
        return 80 / Math.max(0.5, l.weight);
      })
      .strength((l) => Math.min(1, l.weight * 0.3));

    this._sim = forceSimulation<InternalNode>(this._nodes)
      .force("link", linkForce)
      .force(
        "charge",
        forceManyBody<InternalNode>().strength((d) => -40 - d.mass * 12),
      )
      .force("x", forceX<InternalNode>(this._centerX).strength(0.08))
      .force("y", forceY<InternalNode>(this._centerY).strength(0.08))
      .force(
        "collide",
        forceCollide<InternalNode>().radius((d) => d.radius + 2).strength(0.9),
      )
      // alphaDecay(0) keeps the simulation permanently warm. alphaTarget(0.1)
      // caps how vigorously it stirs so nodes drift rather than vibrate. The
      // graph is supposed to feel alive, not frenetic.
      .alphaDecay(0)
      .alphaTarget(0.1)
      .alpha(0.6)
      .on("tick", () => this._emitTick());
  }

  setNodes(nodes: SimNodeInput[]): void {
    if (!this._sim) {
      this.start(nodes, []);
      return;
    }
    this._buildNodes(nodes);
    this._sim.nodes(this._nodes);
  }

  setLinks(links: SimLinkInput[]): void {
    if (!this._sim) {
      this.start([], links);
      return;
    }
    this._buildLinks(links);
    const linkForce = this._sim.force("link") as ForceLink<
      InternalNode,
      InternalLink
    > | null;
    if (linkForce) linkForce.links(this._links);
  }

  bumpAlpha(value = 0.5): void {
    if (!this._sim) return;
    this._sim.alpha(Math.max(this._sim.alpha(), value)).restart();
  }

  onTick(cb: TickHandler): void {
    this._onTick = cb;
  }

  dispose(): void {
    if (this._sim) {
      this._sim.stop();
      this._sim.on("tick", null);
      this._sim = null;
    }
    this._nodes = [];
    this._links = [];
    this._onTick = null;
  }

  private _buildNodes(inputs: SimNodeInput[]): void {
    const prev = new Map(this._nodes.map((n) => [n.id, n]));
    const next: InternalNode[] = [];
    for (const i of inputs) {
      const existing = prev.get(i.id);
      if (existing) {
        existing.mass = i.mass;
        existing.radius = i.radius;
        next.push(existing);
      } else {
        next.push({
          id: i.id,
          mass: i.mass,
          radius: i.radius,
          x: this._centerX + (Math.random() - 0.5) * 60,
          y: this._centerY + (Math.random() - 0.5) * 60,
          vx: 0,
          vy: 0,
        });
      }
    }
    this._nodes = next;
  }

  private _buildLinks(inputs: SimLinkInput[]): void {
    const byId = new Map(this._nodes.map((n) => [n.id, n]));
    const next: InternalLink[] = [];
    for (const l of inputs) {
      const s = byId.get(l.source);
      const t = byId.get(l.target);
      if (!s || !t) continue;
      next.push({ source: s, target: t, weight: l.weight, kind: l.kind });
    }
    this._links = next;
  }

  private _emitTick(): void {
    if (!this._onTick) return;
    // D3 mutates the same node objects in place each tick. Copying into a
    // fresh array makes the result observable-friendly: the store can assign
    // the new snapshot to a MobX-tracked field without triggering "you
    // mutated an observable" warnings or losing reactivity.
    const out: SimPosition[] = this._nodes.map((n) => ({
      id: n.id,
      x: n.x ?? 0,
      y: n.y ?? 0,
      vx: n.vx ?? 0,
      vy: n.vy ?? 0,
    }));
    this._onTick(out);
  }
}
