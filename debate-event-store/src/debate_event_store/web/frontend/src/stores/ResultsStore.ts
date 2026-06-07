import { inject, injectable } from "tsyringe";
import { autorun, makeAutoObservable, runInAction, type IReactionDisposer } from "mobx";
import { DebateApi, TOKEN_DebateApi } from "@/services/DebateApi";
import { SseClient, TOKEN_SseClient } from "@/services/SseClient";
import type { ResultsPosition } from "@/services/wireTypes";
import {
  EventStreamStore,
  TOKEN_EventStreamStore,
} from "@/views/EventStream/EventStreamStore";

export const TOKEN_ResultsStore = Symbol("ResultsStore");

@injectable()
export class ResultsStore {
  private _isOpen = false;
  private _ended = false;
  private _positions: ResultsPosition[] = [];
  private _finalPositions: Record<string, string> = {};
  private _verdictMarkdown: string | null = null;
  private _loading = false;
  private _error: string | null = null;
  // Tracks whether we've already auto-opened on this session's debate-end.
  // Without this, every SSE event during the wind-down would re-open the
  // overlay if the operator dismissed it.
  private _autoOpenedThisSession = false;
  private _autorunDisposer: IReactionDisposer | null = null;

  constructor(
    @inject(TOKEN_DebateApi) private readonly _api: DebateApi,
    @inject(TOKEN_SseClient) private readonly _sse: SseClient,
    @inject(TOKEN_EventStreamStore) private readonly _stream: EventStreamStore,
  ) {
    makeAutoObservable<ResultsStore, "_autorunDisposer">(this, {
      _autorunDisposer: false,
    });

    // Pull the verdict + final positions straight off the SSE snapshot —
    // same substrate the event log uses. No disk roundtrip, no cwd guessing.
    this._sse.onSnapshot((_events, _status, verdictMarkdown, finalPositions) => {
      runInAction(() => {
        this._verdictMarkdown = verdictMarkdown;
        this._finalPositions = finalPositions;
      });
    });
    this._sse.onVerdict((envelope) => {
      runInAction(() => {
        this._verdictMarkdown = envelope.markdown;
      });
    });
    this._sse.onReset(() => {
      runInAction(() => {
        this._verdictMarkdown = null;
        this._finalPositions = {};
        this._ended = false;
        this._autoOpenedThisSession = false;
      });
    });

    // Detect debate-end on the live event stream and auto-trigger the results
    // overlay once. Without this, the operator has to know to click the
    // header button when the debate finishes — which defeats the point of
    // having a final-results screen.
    this._autorunDisposer = autorun(() => {
      const tip = this._stream.tip;
      void tip;
      const events = this._stream.events;
      const endedNow = events.some((e) =>
        typeof e.text === "string" && e.text.startsWith("ORCHESTRATOR: Time is up"),
      );
      if (endedNow !== this._ended) {
        runInAction(() => {
          this._ended = endedNow;
        });
      }
      if (endedNow && !this._autoOpenedThisSession) {
        this._autoOpenedThisSession = true;
        runInAction(() => {
          this._isOpen = true;
        });
        // Also pull positions via REST so the overlay populates immediately
        // even on a clean page-load where the snapshot is still in flight.
        void this.refresh();
      }
    });
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  get ended(): boolean {
    return this._ended;
  }

  get positions(): readonly ResultsPosition[] {
    // Derive positions on demand from the in-memory event stream the rest of
    // the app already has. No need to round-trip through the REST endpoint
    // for this — the data is right there.
    if (this._positions.length > 0) return this._positions;
    return this._derivePositionsFromStream();
  }

  /** Positions ordered by the judge's ranking when a verdict exists.
   *  Each entry carries the agent's *final* synthesis markdown when the
   *  judge has posted one via `debate_set_final_position`; otherwise the
   *  agent's opening POSITION text is used as a fallback. Unranked agents
   *  go to the end in publish order. */
  get rankedPositions(): readonly {
    rank: number | null;
    position: ResultsPosition;
    finalMarkdown: string | null;
  }[] {
    const ranks = this._parseRanking();
    const base = this.positions;
    return base
      .map((position, idx) => ({
        rank: ranks.get(position.agent_id.toLowerCase()) ?? null,
        position,
        finalMarkdown: this._finalPositions[position.agent_id] ?? null,
        _publishIdx: idx,
      }))
      .sort((a, b) => {
        if (a.rank == null && b.rank == null) return a._publishIdx - b._publishIdx;
        if (a.rank == null) return 1;
        if (b.rank == null) return -1;
        return a.rank - b.rank;
      })
      .map(({ rank, position, finalMarkdown }) => ({ rank, position, finalMarkdown }));
  }

  get verdictMarkdown(): string | null {
    return this._verdictMarkdown;
  }

  get loading(): boolean {
    return this._loading;
  }

  get error(): string | null {
    return this._error;
  }

  open(): void {
    this._isOpen = true;
    void this.refresh();
  }

  close(): void {
    this._isOpen = false;
  }

  async refresh(): Promise<void> {
    // The verdict comes via SSE; refresh() is a belt-and-braces pull-path for
    // first paint and the manual ↻ button.
    this._loading = true;
    this._error = null;
    try {
      const r = await this._api.results();
      runInAction(() => {
        this._ended = r.ended;
        this._positions = r.positions;
        this._finalPositions = r.final_positions ?? {};
        this._verdictMarkdown = r.verdict_markdown;
        this._loading = false;
      });
    } catch (e: unknown) {
      runInAction(() => {
        this._loading = false;
        this._error = e instanceof Error ? e.message : String(e);
      });
    }
  }

  /** Parse the verdict for "### {N}{st|nd|rd|th} — {agent_id} (...)" headers.
   *  Tolerant of em-dash, hyphen, and case. Returns lowercased agent_id → rank. */
  private _parseRanking(): Map<string, number> {
    const out = new Map<string, number>();
    if (!this._verdictMarkdown) return out;
    const re = /^###\s+(\d+)(?:st|nd|rd|th)\s+[—\-–]\s+([A-Za-z0-9_]+)\b/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this._verdictMarkdown)) !== null) {
      const rank = Number(m[1]);
      const agent = m[2].toLowerCase();
      if (!out.has(agent)) out.set(agent, rank);
    }
    return out;
  }

  private _derivePositionsFromStream(): ResultsPosition[] {
    const seen = new Set<string>();
    const out: ResultsPosition[] = [];
    for (const e of this._stream.events) {
      if (
        typeof e.text !== "string" ||
        !e.text.startsWith("POSITION") ||
        seen.has(e.agent_id)
      ) {
        continue;
      }
      seen.add(e.agent_id);
      out.push({
        agent_id: e.agent_id,
        position: e.position,
        text: e.text,
        timestamp: e.timestamp,
      });
    }
    return out;
  }

  dispose(): void {
    if (this._autorunDisposer) {
      this._autorunDisposer();
      this._autorunDisposer = null;
    }
  }
}
