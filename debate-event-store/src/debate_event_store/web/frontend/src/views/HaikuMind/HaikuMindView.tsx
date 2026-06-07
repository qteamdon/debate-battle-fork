import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useResolve } from "@/tsyringe-hooks/useResolve";
import {
  SummaryStore,
  TOKEN_SummaryStore,
  type StrawmanFinding,
  type Tension,
  type Convergence,
} from "@/stores/SummaryStore";

/**
 * Right-rail Haiku Mind panel. Three sub-panels (current tide, tensions /
 * convergences, strawman feed). Collapsible because P3 (Framework Hacker)
 * doesn't need it; P2 (Spectator) lives in it. Collapse state is local React
 * state — it's pure UI ornament, no other view depends on it.
 */
export const HaikuMindView = observer(() => {
  const summary = useResolve<SummaryStore>(TOKEN_SummaryStore);
  const [collapsed, setCollapsed] = useState(false);

  // Re-render every 5s so the "Xs ago" freshness label stays current even
  // when no new summary arrives. The MobX observable changes only when a
  // summary lands; this hook bridges wall-clock drift into rendering.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const ageSeconds =
    summary.lastUpdatedAt !== null
      ? Math.max(0, Math.round((Date.now() - summary.lastUpdatedAt) / 1000))
      : null;

  return (
    <section
      className={
        "haiku-mind" + (collapsed ? " haiku-mind--collapsed" : "")
      }
    >
      <header className="haiku-mind__head">
        <h3 className="haiku-mind__title">Summariser</h3>
        <button
          type="button"
          className="haiku-mind__toggle"
          aria-label={collapsed ? "Expand Summariser" : "Collapse Summariser"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      </header>
      {!collapsed && (
        <div className="haiku-mind__body">
          <CurrentTidePanel
            tide={summary.currentTide}
            ageSeconds={ageSeconds}
          />
          <TensionsPanel tensions={summary.tensions} />
          <ConvergencesPanel convergences={summary.convergences} />
          <StrawmanPanel feed={summary.strawmanFeed} />
        </div>
      )}
    </section>
  );
});

const CurrentTidePanel = observer((props: {
  tide: string | null;
  ageSeconds: number | null;
}) => {
  return (
    <div className="haiku-mind__panel haiku-mind__tide">
      <h4 className="haiku-mind__panel-title">Current tide</h4>
      {props.tide ? (
        <>
          <p className="haiku-mind__tide-text">{props.tide}</p>
          {props.ageSeconds !== null && (
            <span className="haiku-mind__freshness">
              {props.ageSeconds}s ago
            </span>
          )}
        </>
      ) : (
        <p className="haiku-mind__empty">Awaiting summariser...</p>
      )}
    </div>
  );
});

const TensionsPanel = observer((props: {
  tensions: readonly Tension[];
}) => {
  return (
    <div className="haiku-mind__panel haiku-mind__tensions">
      <h4 className="haiku-mind__panel-title">Tensions</h4>
      {props.tensions.length === 0 ? (
        <p className="haiku-mind__empty">No tensions surfaced yet</p>
      ) : (
        <ul className="haiku-mind__chips">
          {props.tensions.map((t, i) => (
            <li
              key={`${t.a}-${t.b}-${t.topic ?? ""}-${i}`}
              className="haiku-mind__chip haiku-mind__chip--tension"
            >
              <span className="haiku-mind__chip-agents">
                {t.a} {"⇄"} {t.b}
              </span>
              {t.topic && (
                <span className="haiku-mind__chip-topic">
                  {" "}
                  {"·"} {t.topic}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

const ConvergencesPanel = observer((props: {
  convergences: readonly Convergence[];
}) => {
  return (
    <div className="haiku-mind__panel haiku-mind__convergences">
      <h4 className="haiku-mind__panel-title">Convergences</h4>
      {props.convergences.length === 0 ? (
        <p className="haiku-mind__empty">No convergences surfaced yet</p>
      ) : (
        <ul className="haiku-mind__chips">
          {props.convergences.map((c, i) => (
            <li
              key={`${c.agents.join("+")}-${c.topic ?? ""}-${i}`}
              className="haiku-mind__chip haiku-mind__chip--convergence"
            >
              <span className="haiku-mind__chip-agents">
                {c.agents.join(" + ")}
              </span>
              {c.topic && (
                <span className="haiku-mind__chip-topic">
                  {" "}
                  {"·"} {c.topic}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

const StrawmanPanel = observer((props: {
  feed: readonly StrawmanFinding[];
}) => {
  // Newest first so the latest grounding is at the top, matching the stream.
  const reversed = [...props.feed].reverse();
  return (
    <div className="haiku-mind__panel haiku-mind__strawman">
      <h4 className="haiku-mind__panel-title">Strawman feed</h4>
      {reversed.length === 0 ? (
        <p className="haiku-mind__empty">No groundings yet</p>
      ) : (
        <ul className="haiku-mind__strawman-list">
          {reversed.map((f) => (
            <li
              key={f.sourceEvent}
              className={
                "haiku-mind__strawman-item" +
                ` haiku-mind__strawman-item--${f.kind.toLowerCase()}`
              }
            >
              <span className="haiku-mind__strawman-tag">{f.kind}</span>
              <span className="haiku-mind__strawman-pos">#{f.sourceEvent}</span>
              <span className="haiku-mind__strawman-text">{f.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
