import { injectable } from "tsyringe";
import type {
  ConnectionState,
  DebateEvent,
  DebateStatus,
  SseEnvelope,
  SummaryEnvelope,
  ResetEnvelope,
  VerdictEnvelope,
} from "./wireTypes";

export const TOKEN_SseClient = Symbol("SseClient");

// Re-export wire types here for callers that already import from SseClient.
export type {
  ConnectionState,
  DebateEvent,
  DebateStatus,
  SnapshotEnvelope,
  EventEnvelope,
  SummaryEnvelope,
  ResetEnvelope,
  SseEnvelope,
} from "./wireTypes";

@injectable()
export class SseClient {
  private _source: EventSource | null = null;
  private _snapshotCbs: Array<
    (
    events: DebateEvent[],
    status: DebateStatus,
    verdictMarkdown: string | null,
    finalPositions: Record<string, string>,
  ) => void
  > = [];
  private _eventCbs: Array<(e: DebateEvent) => void> = [];
  private _summaryCbs: Array<(s: SummaryEnvelope) => void> = [];
  private _resetCbs: Array<(r: ResetEnvelope) => void> = [];
  private _verdictCbs: Array<(v: VerdictEnvelope) => void> = [];
  private _stateCbs: Array<(s: ConnectionState) => void> = [];
  private _state: ConnectionState = "closed";

  start(url: string = "/api/stream"): void {
    if (this._source !== null) return;
    this._setState("connecting");
    const source = new EventSource(url);
    source.onopen = () => this._setState("open");
    source.onerror = () => {
      // EventSource auto-reconnects unless readyState === CLOSED.
      if (source.readyState === EventSource.CLOSED) {
        this._setState("closed");
      } else {
        this._setState("reconnecting");
      }
    };
    source.onmessage = (ev) => this._dispatch(ev.data);
    this._source = source;
  }

  stop(): void {
    if (this._source !== null) {
      this._source.close();
      this._source = null;
      this._setState("closed");
    }
  }

  get state(): ConnectionState {
    return this._state;
  }

  onSnapshot(
    cb: (
    events: DebateEvent[],
    status: DebateStatus,
    verdictMarkdown: string | null,
    finalPositions: Record<string, string>,
  ) => void,
  ): void {
    this._snapshotCbs.push(cb);
  }

  onEvent(cb: (e: DebateEvent) => void): void {
    this._eventCbs.push(cb);
  }

  onSummary(cb: (s: SummaryEnvelope) => void): void {
    this._summaryCbs.push(cb);
  }

  onReset(cb: (r: ResetEnvelope) => void): void {
    this._resetCbs.push(cb);
  }

  onVerdict(cb: (v: VerdictEnvelope) => void): void {
    this._verdictCbs.push(cb);
  }

  onStateChange(cb: (s: ConnectionState) => void): void {
    this._stateCbs.push(cb);
  }

  private _setState(s: ConnectionState): void {
    if (this._state === s) return;
    this._state = s;
    for (const cb of this._stateCbs) cb(s);
  }

  private _dispatch(raw: string): void {
    let parsed: SseEnvelope;
    try {
      parsed = JSON.parse(raw) as SseEnvelope;
    } catch {
      return;
    }
    switch (parsed.type) {
      case "snapshot":
        for (const cb of this._snapshotCbs)
          cb(
            parsed.events,
            parsed.status,
            parsed.verdict_markdown ?? null,
            parsed.final_positions ?? {},
          );
        break;
      case "event":
        for (const cb of this._eventCbs) cb(parsed.event);
        break;
      case "summary":
        for (const cb of this._summaryCbs) cb(parsed);
        break;
      case "reset":
        for (const cb of this._resetCbs) cb(parsed);
        break;
      case "verdict":
        for (const cb of this._verdictCbs) cb(parsed);
        break;
    }
  }
}
