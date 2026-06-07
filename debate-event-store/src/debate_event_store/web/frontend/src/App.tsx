import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useResolve } from "@/tsyringe-hooks/useResolve";
import { SseClient, TOKEN_SseClient } from "@/services/SseClient";
import { ConnectionStore, TOKEN_ConnectionStore } from "@/stores/ConnectionStore";
import {
  EventStreamStore,
  TOKEN_EventStreamStore,
} from "@/views/EventStream/EventStreamStore";
import { EventStreamView } from "@/views/EventStream/EventStreamView";
import { AgentsRailView } from "@/views/AgentsRail/AgentsRailView";
import { FilterChipsView } from "@/views/Filters/FilterChipsView";
import { ModeratorFooterView } from "@/views/Moderator/ModeratorFooterView";
import { TimelineView } from "@/views/Timeline/TimelineView";
import { PositionGraphView } from "@/views/PositionGraph/PositionGraphView";
import { DrillDownOverlay } from "@/views/DrillDown/DrillDownOverlay";
import { HaikuMindView } from "@/views/HaikuMind/HaikuMindView";
import { ResultsOverlay } from "@/views/Results/ResultsOverlay";
import { ResultsStore, TOKEN_ResultsStore } from "@/stores/ResultsStore";
import {
  ModeratorInputStore,
  TOKEN_ModeratorInputStore,
} from "@/stores/ModeratorInputStore";

export const App = observer(() => {
  const sse = useResolve<SseClient>(TOKEN_SseClient);
  const conn = useResolve<ConnectionStore>(TOKEN_ConnectionStore);
  const stream = useResolve<EventStreamStore>(TOKEN_EventStreamStore);
  const moderator = useResolve<ModeratorInputStore>(TOKEN_ModeratorInputStore);
  const results = useResolve<ResultsStore>(TOKEN_ResultsStore);

  useEffect(() => {
    sse.start();
    return () => sse.stop();
  }, [sse]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        moderator.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moderator]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>Live Debate</h1>
        <div className="app__header-meta">
          {stream.topic && <span className="app__topic">{stream.topic}</span>}
          <button
            type="button"
            className={
              "app__results-btn" + (results.ended ? " app__results-btn--ready" : "")
            }
            onClick={() => results.open()}
          >
            {results.ended ? "Results ●" : "Results"}
          </button>
          <span className={`app__conn app__conn--${conn.state}`}>{conn.state}</span>
        </div>
      </header>
      <main className="app__main">
        <aside className="app__rail">
          <AgentsRailView />
        </aside>
        <section className="app__center">
          <TimelineView />
          <FilterChipsView />
          <EventStreamView />
        </section>
        <aside className="app__right">
          <PositionGraphView />
          <HaikuMindView />
        </aside>
      </main>
      <footer className="app__moderator">
        <ModeratorFooterView />
      </footer>
      <DrillDownOverlay />
      <ResultsOverlay />
    </div>
  );
});
