import { injectable } from "tsyringe";
import { makeAutoObservable } from "mobx";
import { ALL_EVENT_TYPES, eventType, mentionsOf, type EventType } from "@/lib/eventTypes";
import type { DebateEvent } from "@/services/wireTypes";

export const TOKEN_FiltersStore = Symbol("FiltersStore");

@injectable()
export class FiltersStore {
  private _enabledTypes: Set<EventType> = new Set([...ALL_EVENT_TYPES, "OTHER"]);
  private _focusedAgent: string | null = null;
  private _focusedMentionFrom: string | null = null;
  private _autoScroll = true;

  constructor() {
    makeAutoObservable(this);
  }

  get enabledTypes(): ReadonlySet<EventType> {
    return this._enabledTypes;
  }

  get focusedAgent(): string | null {
    return this._focusedAgent;
  }

  get focusedMentionFrom(): string | null {
    return this._focusedMentionFrom;
  }

  get autoScroll(): boolean {
    return this._autoScroll;
  }

  isTypeEnabled(t: EventType): boolean {
    return this._enabledTypes.has(t);
  }

  toggleType(t: EventType): void {
    const next = new Set(this._enabledTypes);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    this._enabledTypes = next;
  }

  setFocusedAgent(id: string | null): void {
    this._focusedAgent = id;
  }

  // Stub for Phase 7 drill-down: lets the overlay scope the stream to events
  // authored by a specific agent. No UI in Phase 4.
  setMentionFromFilter(id: string | null): void {
    this._focusedMentionFrom = id;
  }

  setAutoScroll(b: boolean): void {
    this._autoScroll = b;
  }

  passes(event: DebateEvent): boolean {
    const t = eventType(event.text);
    if (!this._enabledTypes.has(t)) return false;
    if (this._focusedAgent !== null) {
      const mentioned = mentionsOf(event.text);
      if (
        event.agent_id !== this._focusedAgent &&
        !mentioned.includes(this._focusedAgent)
      ) {
        return false;
      }
    }
    if (this._focusedMentionFrom !== null) {
      if (event.agent_id !== this._focusedMentionFrom) return false;
    }
    return true;
  }
}
