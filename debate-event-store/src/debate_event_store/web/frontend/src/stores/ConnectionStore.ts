import { inject, injectable } from "tsyringe";
import { makeAutoObservable } from "mobx";
import { SseClient, TOKEN_SseClient, type ConnectionState } from "@/services/SseClient";

export const TOKEN_ConnectionStore = Symbol("ConnectionStore");

@injectable()
export class ConnectionStore {
  private _state: ConnectionState = "closed";
  private _reconnectCount = 0;
  private _lastError: string | null = null;

  constructor(@inject(TOKEN_SseClient) sse: SseClient) {
    makeAutoObservable(this);
    sse.onStateChange((s) => this._apply(s));
    this._state = sse.state;
  }

  get state(): ConnectionState {
    return this._state;
  }

  get reconnectCount(): number {
    return this._reconnectCount;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  private _apply(s: ConnectionState): void {
    // Only count true reconnects (open -> reconnecting), not initial failures
    // (connecting -> reconnecting). The first transient error before we ever
    // see "open" is not a reconnect; it's a not-yet-connected.
    if (s === "reconnecting" && this._state === "open") {
      this._reconnectCount += 1;
    }
    this._state = s;
  }
}
