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
  // Auto-fit the visible window to the debate's actual span. The configured
  // `visibleWindowSeconds` (default 120) is the FLOOR — when a debate runs
  // longer, we expand to cover the full data plus a small live headroom on
  // the right, otherwise events older than the floor get trimmed off the
  // left and the operator sees a half-empty chart with everyone bunched at
  // the right edge. Headroom keeps the latest event visibly inside the plot
  // rather than pinned to the right margin.
  const headroomMs = Math.max(30000, view.visibleWindowSeconds * 250);
  const dataSpanMs = events.length > 0 ? Math.max(0, lastEventMs - firstEventMs) : 0;
  const windowMs = Math.max(
    view.visibleWindowSeconds * 1000,
    dataSpanMs + headroomMs,
  );
  // Once the debate ends, the 250ms heartbeat would otherwise slide the chart
  // forward indefinitely on wall-clock time, eventually pushing every event
  // off the left edge and leaving the operator with an empty plot (and a
  // scrubber thumb wiggling at the right edge as `nowMs` ticks past stale
  // `firstEventMs`). Once events exist, cap the live right-edge at the
  // headroom past `lastEventMs` — enough to feel live when a new event lands,
  // but the latest event stays comfortably visible.
  const liveRightEdgeMs = events.length > 0
    ? Math.min(effectiveNowMs, lastEventMs + headroomMs)
    : effectiveNowMs;
  const rightEdgeMs = view.isLive
    ? liveRightEdgeMs
    : (view.scrubberPosition ?? effectiveNowMs);
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
          {/* x axis ticks: step-size adapts to window so labels neither
              overlap nor disappear, and labels handle sub-minute spans
              ("-30s") instead of rounding 30s to "-1m" and 90s to "-2m"
              (which makes two adjacent ticks both read "-2m"). */}
          {(() => {
            const windowSec = Math.max(1, Math.round(windowMs / 1000));
            const stepCandidates = [10, 15, 30, 60, 120, 300, 600, 1800, 3600];
            const targetTicks = 5;
            const tickStepSec = stepCandidates.find(
              (s) => windowSec / s <= targetTicks + 0.5,
            ) ?? 3600;
            const ticks: number[] = [];
            for (let s = 0; s <= windowSec; s += tickStepSec) ticks.push(s);
            const fmt = (secAgo: number): string => {
              if (secAgo === 0) return "now";
              if (secAgo < 60) return `-${secAgo}s`;
              const m = Math.floor(secAgo / 60);
              const s = secAgo % 60;
              return s === 0 ? `-${m}m` : `-${m}m${s.toString().padStart(2, "0")}s`;
            };
            return ticks.map((secAgo) => {
              const tMs = rightEdgeMs - secAgo * 1000;
              if (tMs < leftEdgeMs) return null;
              const x = xScale(tMs);
              return (
                <g key={`x-${secAgo}`}>
                  <line x1={x} x2={x} y1={innerH} y2={innerH + 4} stroke="#2c3140" />
                  <text x={x} y={innerH + 16} fill="#5a6275" fontSize={10} textAnchor="middle">
                    {fmt(secAgo)}
                  </text>
                </g>
              );
            });
          })()}
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

      {/* Scrubber's `nowMs` defines its max-value. Pass the capped live-edge
          (not the unbounded wall clock) so the thumb stops creeping right
          once the debate ends — same anchor logic as the chart. */}
      <ScrubberView firstEventMs={firstEventMs} nowMs={liveRightEdgeMs} />

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
