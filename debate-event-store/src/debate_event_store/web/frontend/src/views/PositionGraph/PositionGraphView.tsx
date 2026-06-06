import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useResolve } from "@/tsyringe-hooks/useResolve";
import {
  PositionGraphStore,
  TOKEN_PositionGraphStore,
  type EdgeKind,
} from "@/stores/PositionGraphStore";
import { FiltersStore, TOKEN_FiltersStore } from "@/stores/FiltersStore";
import { DrillDownStore, TOKEN_DrillDownStore } from "@/stores/DrillDownStore";
import { roleColor, roleName } from "@/lib/roleHues";

const WIDTH = 300;
const HEIGHT = 280;
const PADDING = 12;

const EDGE_LABEL: Record<EdgeKind, string> = {
  rebuttal: "rebuttal",
  concede: "concede",
  mention: "mention",
  grounding: "grounding",
};

interface EdgeHover {
  edgeKey: string;
  label: string;
  count: number;
  position: number;
  screenX: number;
  screenY: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function edgeClass(kind: EdgeKind): string {
  return `position-graph__edge position-graph__edge--${kind}`;
}

function edgeStrokeWidth(kind: EdgeKind, weight: number): number {
  if (kind === "mention") return 0.5;
  if (kind === "grounding") return 1.2;
  return clamp(weight, 1, 4);
}

export const PositionGraphView = observer(() => {
  const store = useResolve<PositionGraphStore>(TOKEN_PositionGraphStore);
  const filters = useResolve<FiltersStore>(TOKEN_FiltersStore);
  const drill = useResolve<DrillDownStore>(TOKEN_DrillDownStore);
  const [hover, setHover] = useState<EdgeHover | null>(null);

  // NOTE: the store is a tsyringe singleton with a long-running autorun + D3
  // simulation. We deliberately do NOT call store.dispose() on unmount —
  // React 18 strict-mode double-mounts (and any parent re-render that
  // briefly unmounts this view) would otherwise permanently kill the
  // simulation. The store lives the app lifetime; it's reclaimed when the
  // page unloads.

  const nodes = store.nodes;
  const edges = store.edges;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const onNodeClick = (id: string) => {
    // Phase 7: dual-fire. Toggle the stream filter as before AND open the
    // drill-down overlay for this agent.
    if (filters.focusedAgent === id) filters.setFocusedAgent(null);
    else filters.setFocusedAgent(id);
    drill.open(id);
  };

  return (
    <div className="position-graph">
      <div className="position-graph__head">
        <span className="position-graph__head-title">Position graph</span>
        <span className="position-graph__head-sub">node size = momentum</span>
      </div>
      <svg
        role="img"
        aria-label="Position graph"
        className="position-graph__svg"
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <g className="position-graph__edges">
          {edges.map((e) => {
            const s = nodeById.get(e.source);
            const t = nodeById.get(e.target);
            if (!s || !t) return null;
            return (
              <line
                key={e.key}
                className={edgeClass(e.kind)}
                x1={clamp(s.x, PADDING, WIDTH - PADDING)}
                y1={clamp(s.y, PADDING, HEIGHT - PADDING)}
                x2={clamp(t.x, PADDING, WIDTH - PADDING)}
                y2={clamp(t.y, PADDING, HEIGHT - PADDING)}
                strokeWidth={edgeStrokeWidth(e.kind, e.weight)}
                onMouseEnter={(ev) =>
                  setHover({
                    edgeKey: e.key,
                    label: EDGE_LABEL[e.kind],
                    count: e.count,
                    position: e.mostRecentPosition,
                    screenX: ev.clientX,
                    screenY: ev.clientY,
                  })
                }
                onMouseMove={(ev) =>
                  setHover((prev) =>
                    prev && prev.edgeKey === e.key
                      ? { ...prev, screenX: ev.clientX, screenY: ev.clientY }
                      : prev,
                  )
                }
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </g>
        <g className="position-graph__nodes">
          {nodes.map((n) => {
            const cx = clamp(n.x, PADDING, WIDTH - PADDING);
            const cy = clamp(n.y, PADDING, HEIGHT - PADDING);
            const color = roleColor(n.id);
            const isFocused = filters.focusedAgent === n.id;
            const opacity = clamp(0.55 + n.mass * 0.08, 0.55, 1);
            return (
              <g
                key={n.id}
                className="position-graph__node"
                onClick={() => onNodeClick(n.id)}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={n.radius}
                  fill={color}
                  opacity={opacity}
                  stroke={isFocused ? "#ffffff" : "#0b0d12"}
                  strokeWidth={isFocused ? 2 : 1.5}
                />
                <text
                  className="position-graph__node-label"
                  x={cx}
                  y={cy - n.radius - 4}
                  textAnchor="middle"
                  fill="#e7eaf0"
                >
                  {roleName(n.id)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {hover && (
        <div
          className="position-graph__tooltip"
          style={{ left: hover.screenX + 12, top: hover.screenY + 12 }}
        >
          {`${hover.count} ${hover.label}${hover.count === 1 ? "" : "s"} · most recent #${hover.position}`}
        </div>
      )}
    </div>
  );
});
