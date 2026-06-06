import { injectable } from "tsyringe";
import { makeAutoObservable } from "mobx";

export const TOKEN_TimelineViewStore = Symbol("TimelineViewStore");

@injectable()
export class TimelineViewStore {
  private _scrubberPosition: number | null = null;
  private _visibleWindowSeconds = 120;
  // Re-render heartbeat: a wall-clock observable that ticks so the chart
  // slides left on its own when live. View component pokes this every 250ms.
  private _nowMs = Date.now();
  // Position requested by a tick / takedown click or scrubber drag;
  // EventStreamView watches this and scrolls. Cleared once consumed.
  private _focusedStreamPosition: number | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get scrubberPosition(): number | null {
    return this._scrubberPosition;
  }

  get visibleWindowSeconds(): number {
    return this._visibleWindowSeconds;
  }

  get nowMs(): number {
    return this._nowMs;
  }

  get isLive(): boolean {
    return this._scrubberPosition === null;
  }

  get focusedStreamPosition(): number | null {
    return this._focusedStreamPosition;
  }

  setScrubber(positionMs: number | null): void {
    this._scrubberPosition = positionMs;
  }

  backToLive(): void {
    this._scrubberPosition = null;
  }

  setVisibleWindowSeconds(s: number): void {
    if (s > 10 && s < 3600) this._visibleWindowSeconds = s;
  }

  tickNow(nowMs?: number): void {
    this._nowMs = nowMs ?? Date.now();
  }

  requestStreamScroll(position: number): void {
    this._focusedStreamPosition = position;
  }

  clearStreamScrollRequest(): void {
    this._focusedStreamPosition = null;
  }
}
