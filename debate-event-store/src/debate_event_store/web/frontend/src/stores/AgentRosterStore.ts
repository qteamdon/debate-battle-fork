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
      const mentioned = mentionsOf(e.text);
      state.mentionsOut += mentioned.length;
      for (const target of mentioned) {
        if (target === id) continue;
        let other = map.get(target);
        if (!other) {
          other = {
            agent_id: target,
            eventCount: 0,
            typeCounts: {},
            firstSeenAt: e.timestamp,
            lastEventAt: e.timestamp,
            lastEventPosition: 0,
            mentionsIn: 0,
            mentionsOut: 0,
          };
          map.set(target, other);
        }
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

  // Groups agents into tension-pair clusters plus a trailing "others" bucket.
  // If no tension pairs detected, returns a single flat group.
  get groups(): ReadonlyArray<{ label: string | null; agentIds: string[] }> {
    const list = this.agentList;
    const pairs = this.tensionPairs;
    if (pairs.length === 0) {
      return [{ label: null, agentIds: list.map((a) => a.agent_id) }];
    }
    const claimed = new Set<string>();
    const out: Array<{ label: string | null; agentIds: string[] }> = [];
    for (const p of pairs) {
      const present = p.agentIds.filter((id) => this.agents.has(id));
      if (present.length === 0) continue;
      for (const id of present) claimed.add(id);
      out.push({ label: p.label, agentIds: present });
    }
    const others = list
      .map((a) => a.agent_id)
      .filter((id) => !claimed.has(id));
    if (others.length > 0) out.push({ label: "Other", agentIds: others });
    return out;
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
