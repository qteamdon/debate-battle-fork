import { inject, injectable } from "tsyringe";
import { makeAutoObservable } from "mobx";
import {
  EventStreamStore,
  TOKEN_EventStreamStore,
} from "@/views/EventStream/EventStreamStore";
import { eventType, mentionsOf, type EventType } from "@/lib/eventTypes";

export const TOKEN_AgentRosterStore = Symbol("AgentRosterStore");

export interface AgentState {
  agent_id: string;
  eventCount: number;
  typeCounts: Partial<Record<EventType, number>>;
  firstSeenAt: number;
  lastEventAt: number;
  lastEventPosition: number;
  mentionsIn: number;
  mentionsOut: number;
}

export interface TensionPair {
  label: string;
  agentIds: string[];
}

@injectable()
export class AgentRosterStore {
  constructor(
    @inject(TOKEN_EventStreamStore) private readonly _stream: EventStreamStore,
  ) {
    makeAutoObservable(this);
  }

  get agents(): ReadonlyMap<string, AgentState> {
    // Two-pass: first pass records every actual publisher (agents who emit
    // events). Second pass counts incoming-mentions but ONLY for agents we
    // already know publish — otherwise stray `@word` tokens in event text
    // (e.g. `@Entire`, `@Debate`, `@Name`) get promoted to spurious agents
    // and clutter the rail. The mention regex is `/@([a-zA-Z][a-zA-Z0-9_]*)/`
    // which has no way to distinguish "agent reference" from "ordinary
    // English word that happens to follow an @". The roster is the right
    // place to enforce that distinction: an agent is someone who publishes,
    // not someone who is named.
    const map = new Map<string, AgentState>();
    for (const e of this._stream.events) {
      const id = e.agent_id;
      let state = map.get(id);
      if (!state) {
        state = {
          agent_id: id,
          eventCount: 0,
          typeCounts: {},
          firstSeenAt: e.timestamp,
          lastEventAt: e.timestamp,
          lastEventPosition: e.position,
          mentionsIn: 0,
          mentionsOut: 0,
        };
        map.set(id, state);
      }
      state.eventCount += 1;
      const t = eventType(e.text);
      state.typeCounts[t] = (state.typeCounts[t] ?? 0) + 1;
      if (e.timestamp > state.lastEventAt) state.lastEventAt = e.timestamp;
      if (e.position > state.lastEventPosition) state.lastEventPosition = e.position;
    }
    // Second pass: mentions, but only crediting them to already-known agents.
    for (const e of this._stream.events) {
      const id = e.agent_id;
      const state = map.get(id);
      if (!state) continue;
      const mentioned = mentionsOf(e.text);
      for (const target of mentioned) {
        if (target === id) continue;
        const other = map.get(target);
        if (!other) continue;
        state.mentionsOut += 1;
        other.mentionsIn += 1;
      }
    }
    return map;
  }

  get agentList(): readonly AgentState[] {
    return [...this.agents.values()].sort(
      (a, b) => a.firstSeenAt - b.firstSeenAt,
    );
  }

  // Tension pairs are inferred from REBUTTAL/CRITIQUE engagements between
  // agents: an ordered (author -> target) pair seen >= 2 times becomes
  // candidate evidence. We collapse symmetric pairs into an unordered set,
  // sum the conflict weight in both directions, and keep the top 3 by weight.
  // We do not hardcode personas — if events haven't established a pair yet,
  // the rail shows agents flat.
  get tensionPairs(): readonly TensionPair[] {
    const weight = new Map<string, number>();
    for (const e of this._stream.events) {
      const t = eventType(e.text);
      if (t !== "REBUTTAL" && t !== "CRITIQUE") continue;
      const targets = mentionsOf(e.text);
      for (const target of targets) {
        if (target === e.agent_id) continue;
        const key = [e.agent_id, target].sort().join("|");
        weight.set(key, (weight.get(key) ?? 0) + 1);
      }
    }
    const pairs: TensionPair[] = [];
    for (const [key, w] of weight) {
      if (w < 2) continue;
      const [a, b] = key.split("|");
      pairs.push({
        label: `${cap(a)} ⇄ ${cap(b)}`,
        agentIds: [a, b],
      });
    }
    pairs.sort((p, q) => {
      const wp = weight.get([...p.agentIds].sort().join("|")) ?? 0;
      const wq = weight.get([...q.agentIds].sort().join("|")) ?? 0;
      if (wp !== wq) return wq - wp;
      // Deterministic tie-break: lex key. Avoids reliance on Map insertion
      // order, which is sensitive to event arrival order.
      const kp = [...p.agentIds].sort().join("|");
      const kq = [...q.agentIds].sort().join("|");
      return kp < kq ? -1 : kp > kq ? 1 : 0;
    });
    return pairs.slice(0, 3);
  }

  // Flat list of unique agents in first-seen order. We dropped the
  // tension-pair grouping because (a) every agent who rebuts >=2 others
  // appeared in multiple groups (e.g. "Alice ⇄ Bob" AND "Alice ⇄ Eve"
  // listed Alice twice) and (b) the dynamic group labels were generated
  // by extracting words from event text, which produced confusing tags
  // like "Entire", "Debate", "Name". Inferred tension belongs in the
  // position graph, not the agents rail. Each agent should appear exactly
  // once here so the operator can see "who's at the table" at a glance.
  get groups(): ReadonlyArray<{ label: string | null; agentIds: string[] }> {
    const list = this.agentList;
    return [{ label: null, agentIds: list.map((a) => a.agent_id) }];
  }

  budgetFor(agent_id: string): { used: number; limit: number } {
    const state = this.agents.get(agent_id);
    return {
      used: state?.eventCount ?? 0,
      limit: this._stream.perAgentEventLimit,
    };
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
