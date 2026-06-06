import { inject, injectable } from "tsyringe";
import { makeAutoObservable } from "mobx";
import {
  SseClient,
  TOKEN_SseClient,
  type DebateEvent,
  type DebateStatus,
} from "@/services/SseClient";

export const TOKEN_EventStreamStore = Symbol("EventStreamStore");

@injectable()
export class EventStreamStore {
  private _events: DebateEvent[] = [];
  private _tip = 0;
  private _topic: string | null = null;
  private _perAgentEventLimit = 200;

  constructor(@inject(TOKEN_SseClient) sse: SseClient) {
    makeAutoObservable(this);
    sse.onSnapshot((events, status) => this.ingestSnapshot(events, status));
    sse.onEvent((e) => this.applyEvent(e));
    sse.onReset((r) => this.applyReset(r.per_agent_event_limit));
  }

  get events(): readonly DebateEvent[] {
    return this._events;
  }

  get tip(): number {
    return this._tip;
  }

  get topic(): string | null {
    return this._topic;
  }

  get perAgentEventLimit(): number {
    return this._perAgentEventLimit;
  }

  get eventsNewestFirst(): readonly DebateEvent[] {
    return [...this._events].reverse();
  }

  ingestSnapshot(events: DebateEvent[], status: DebateStatus): void {
    this._events = [...events].sort((a, b) => a.position - b.position);
    const tipFromStatus = typeof status.tip === "number" ? status.tip : undefined;
    const tipFromEvents = this._events.length
      ? this._events[this._events.length - 1].position
      : 0;
    this._tip = tipFromStatus ?? tipFromEvents;
    this._topic = typeof status.topic === "string" ? status.topic : null;
    if (typeof status.per_agent_event_limit === "number") {
      this._perAgentEventLimit = status.per_agent_event_limit;
    }
  }

  applyEvent(event: DebateEvent): void {
    // Snapshot/stream window race: backend warned the same position may arrive
    // twice. Dedupe here so the timeline stays unique.
    if (this._events.some((e) => e.position === event.position)) return;
    this._events.push(event);
    if (event.position > this._tip) this._tip = event.position;
  }

  applyReset(perAgentEventLimit?: number): void {
    this._events = [];
    this._tip = 0;
    this._topic = null;
    if (typeof perAgentEventLimit === "number") {
      this._perAgentEventLimit = perAgentEventLimit;
    }
  }
}
