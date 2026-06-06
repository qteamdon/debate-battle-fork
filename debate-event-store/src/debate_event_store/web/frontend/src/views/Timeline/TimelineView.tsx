import { observer } from "mobx-react-lite";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useResolve } from "@/tsyringe-hooks/useResolve";
import {
  MomentumStore,
  TOKEN_MomentumStore,
  type Takedown,
} from "@/stores/MomentumStore";
import {
  TimelineViewStore,
  TOKEN_TimelineViewStore,
} from "@/stores/TimelineViewStore";
import {
  D3LayoutService,
  TOKEN_D3LayoutService,
  type XY,
} from "@/services/D3LayoutService";
import {
  EventStreamStore,
  TOKEN_EventStreamStore,
} from "@/views/EventStream/EventStreamStore";
import { roleColor, roleName } from "@/lib/roleHues";
import { eventType } from "@/lib/eventTypes";
import { TakedownMarker } from "./TakedownMarker";
import { ScrubberView } from "./ScrubberView";
import type { DebateEvent } from "@/services/wireTypes";

const HEIGHT = 240;
const MARGIN = { top: 16, right: 90, bottom: 24, left: 36 };
const HEARTBEAT_MS = 250;

interface TickHover {
  agentId: string;
  eventPosition: number;
  screenX: number;
  screenY: number;
}

interface TakedownHover {
  td: Takedown;
  screenX: number;
  screenY: number;
}

export const TimelineView = observer(() => {
  const momentum = useResolve<MomentumStore>(TOKEN_MomentumStore);
  const view = useResolve<TimelineViewStore>(TOKEN_TimelineViewStore);
  const layout = useResolve<D3LayoutService>(TOKEN_D3LayoutService);
  const stream = useResolve<EventStreamStore>(TOKEN_EventStreamStore);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(720);
  const [tickHover, setTickHover] = useState<TickHover | null>(null);
  const [takedownHover, setTakedownHover] = useState<TakedownHover | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.floor(w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Heartbeat: a 250ms interval keeps the chart sliding when live. Stops
  // firing scroll-style work once the user scrubs back (we still tick the
  // wall clock so "back to live" UI stays current, but the visible window
  // anchors on the scrubber).
  useEffect(() => {
    const id = window.setInterval(() => view.tickNow(), HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [view]);

  const events = stream.events;
  // Latest-event-ms guards against the 250ms heartbeat racing fresh events:
  // if an event lands between heartbeat ticks, view.nowMs may still be behind
  // the event's timestamp. We bump effectiveNowMs to whichever is later so
  // the chart's right edge never trails the data, and the scrubber's
  // min/max never invert.
  const lastEventMs = events.length > 0
    ? events[events.length - 1].timestamp * 1000
    : 0;
  const effectiveNowMs = Math.max(view.nowMs, lastEventMs);
  const firstEventMs = useMemo(
    () => (events.length > 0 ? events[0].timestamp * 1000 : effectiveNowMs - 60000),
    [events, effectiveNowMs],
  );
  const rightEdgeMs = view.isLive
    ? effectiveNowMs
    : (view.scrubberPosition ?? effectiveNowMs);
  const windowMs = view.visibleWindowSeconds * 1000;
  const leftEdgeMs = rightEdgeMs - windowMs;

  const innerW = Math.max(50, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const series = momentum.series(view.nowMs);
  const topSet = new Set(momentum.topAgents);
  const currentScores = momentum.currentScores;

  const xScale = layout.computeTimeScale(leftEdgeMs, rightEdgeMs, 0, innerW);
  // Pull every score value (across all agents and time) into the y-domain so
  // the chart auto-scales globally. Without this, scrubbing back can clip.
  const allValues: number[] = [];
  for (const pts of series.values()) for (const p of pts) allValues.push(p.score);
  if (allValues.length === 0) allValues.push(0);
  const yScale = layout.computeMomentumScale(allValues, 0, innerH);

  const yZero = yScale(0);

  // Build a position->event lookup for tick metadata (type, text).
  const eventByPosition = useMemo(() => {
    const m = new Map<number, DebateEvent>();
    for (const e of events) m.set(e.position, e);
    return m;
  }, [events]);

  // Find the agent y at a given timestamp by walking that agent's points.
  const yAtTime = (agentId: string, tSec: number): number => {
    const pts = series.get(agentId);
    if (!pts || pts.length === 0) return yZero;
    let prev = pts[0];
    for (const p of pts) {
      if (p.t <= tSec) prev = p;
      else break;
    }
    return yScale(prev.score);
  };

  return (
    <div ref={containerRef} className="timeline">
      <div className="timeline__head">
        <span className="timeline__head-title">Momentum & Takedowns</span>
        <span className="timeline__head-sub">x = time · y = signed momentum · ⚡ = takedown</span>
        <div className="timeline__head-right">
          {!view.isLive && (
            <button
              type="button"
              className="timeline__pill timeline__pill--live"
              onClick={() => view.backToLive()}
            >
              {"● back to live"}
            </button>
          )}
        </div>
      </div>
      <svg
        role="img"
        aria-label="Momentum chart"
        className="timeline__svg"
        width={width}
        height={HEIGHT}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* gridlines */}
          {yScale.ticks(5).map((v: number) => (
            <line
              key={`grid-${v}`}
              x1={0}
              x2={innerW}
              y1={yScale(v)}
              y2={yScale(v)}
              stroke="#1a1f29"
              strokeDasharray="2 3"
            />
          ))}
          {/* zero baseline */}
          <line x1={0} x2={innerW} y1={yZero} y2={yZero} stroke="#3a4150" strokeWidth={1} />
          {/* x axis minute ticks: from leftEdge to rightEdge, label "-Xm" */}
          {[120, 90, 60, 30, 0].map((secAgo) => {
            const tMs = rightEdgeMs - secAgo * 1000;
            if (tMs < leftEdgeMs) return null;
            const x = xScale(tMs);
            const label = secAgo === 0 ? "now" : `-${Math.round(secAgo / 60)}m`;
            return (
              <g key={`x-${secAgo}`}>
                <line x1={x} x2={x} y1={innerH} y2={innerH + 4} stroke="#2c3140" />
                <text x={x} y={innerH + 16} fill="#5a6275" fontSize={10} textAnchor="middle">
                  {label}
                </text>
              </g>
            );
          })}
          {/* y axis labels */}
          {yScale.ticks(5).map((v: number) => (
            <text
              key={`y-${v}`}
              x={-6}
              y={yScale(v) + 3}
              fill="#5a6275"
              fontSize={10}
              textAnchor="end"
            >
              {v > 0 ? `+${v}` : `${v}`}
            </text>
          ))}

          {/* lines per agent */}
          {[...series.entries()].map(([agentId, pts]) => {
            const color = roleColor(agentId);
            const isTop = topSet.has(agentId);
            const current = currentScores.get(agentId) ?? 0;
            const points: XY[] = pts.map((p) => ({ x: xScale(p.t * 1000), y: yScale(p.score) }));
            const d = layout.pathFor(points);
            const last = pts[pts.length - 1];
            return (
              <g key={`line-${agentId}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={isTop ? 3 : 1.5}
                  strokeOpacity={current < 0 ? 0.6 : 0.95}
                />
                {last && (
                  <text
                    x={xScale(last.t * 1000) + 6}
                    y={yScale(last.score) + 3}
                    fill={color}
                    fontSize={11}
                    fontWeight={700}
                  >
                    {`${roleName(agentId)} ${current >= 0 ? "+" : ""}${current.toFixed(1)}`}
                  </text>
                )}
                {pts.map((p) => (
                  <circle
                    key={`tick-${agentId}-${p.eventPosition}`}
                    cx={xScale(p.t * 1000)}
                    cy={yScale(p.score)}
                    r={2.8}
                    fill={color}
                    stroke="#0b0d12"
                    strokeWidth={1.5}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) =>
                      setTickHover({
                        agentId,
                        eventPosition: p.eventPosition,
                        screenX: e.clientX,
                        screenY: e.clientY,
                      })
                    }
                    onMouseMove={(e) =>
                      setTickHover((prev) =>
                        prev && prev.eventPosition === p.eventPosition
                          ? { ...prev, screenX: e.clientX, screenY: e.clientY }
                          : prev,
                      )
                    }
                    onMouseLeave={() => setTickHover(null)}
                    onClick={() => view.requestStreamScroll(p.eventPosition)}
                  />
                ))}
              </g>
            );
          })}

          {/* takedown markers */}
          {momentum.takedowns.map((td) => {
            const x = xScale(td.timestamp * 1000);
            const y = yAtTime(td.agentId, td.timestamp);
            return (
              <TakedownMarker
                key={`td-${td.eventPosition}-${td.agentId}`}
                takedown={td}
                cx={x}
                cy={y}
                onHover={(t, sx, sy) =>
                  setTakedownHover(t ? { td: t, screenX: sx, screenY: sy } : null)
                }
                onClick={(t) => view.requestStreamScroll(t.eventPosition)}
              />
            );
          })}
        </g>
      </svg>

      <ScrubberView firstEventMs={firstEventMs} nowMs={effectiveNowMs} />

      {tickHover && (() => {
        const e = eventByPosition.get(tickHover.eventPosition);
        if (!e) return null;
        return (
          <div
            className="timeline__tooltip"
            style={{ left: tickHover.screenX + 12, top: tickHover.screenY + 12 }}
          >
            <div>
              <strong style={{ color: roleColor(tickHover.agentId) }}>
                {roleName(tickHover.agentId)}
              </strong>
              {" · #"}
              {e.position}
              {" "}
              {eventType(e.text)}
            </div>
            <div className="timeline__tooltip-body">{e.text}</div>
            <div className="timeline__tooltip-hint">click to jump stream</div>
          </div>
        );
      })()}

      {takedownHover && (
        <div
          className="timeline__tooltip"
          style={{ left: takedownHover.screenX + 12, top: takedownHover.screenY + 12 }}
        >
          <div>
            <strong style={{ color: "#ffb547" }}>{"⚡ Takedown"}</strong>
            {" · "}
            {roleName(takedownHover.td.agentId)}
            {" · #"}
            {takedownHover.td.eventPosition}
          </div>
          <div className="timeline__tooltip-body">
            {takedownHover.td.blurb ?? "click to jump stream"}
          </div>
        </div>
      )}
    </div>
  );
});
