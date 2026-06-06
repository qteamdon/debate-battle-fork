import { observer } from "mobx-react-lite";
import type { DebateEvent } from "@/services/wireTypes";
import { buildEngagements } from "@/lib/qualityChecks";
import { TYPE_COLOR, type EventType } from "@/lib/eventTypes";
import { roleName } from "@/lib/roleHues";

interface Props {
  agentId: string;
  events: readonly DebateEvent[];
  onTargetClick: (target: string) => void;
}

// Order matters: rebuttals/critiques get rendered before yields so the bar
// reads left-to-right as "attack -> yield" — same logical order as the
// quality scorecard's hostility-to-concession spectrum.
const SEGMENT_ORDER: readonly EventType[] = [
  "REBUTTAL",
  "CRITIQUE",
  "CONCEDE",
  "CONVERGENCE",
  "GROUNDING",
  "ARGUMENT",
  "POSITION",
  "ROLE",
  "MODERATOR",
  "OTHER",
];

const BAR_WIDTH = 200;
const BAR_HEIGHT = 10;

export const EngagementsTab = observer((props: Props) => {
  const { agentId, events, onTargetClick } = props;
  const rows = buildEngagements(agentId, events);

  if (rows.length === 0) {
    return (
      <div className="drill-down__section">
        <div className="drill-down__empty">
          @{agentId} has not mentioned any other agents yet.
        </div>
      </div>
    );
  }

  const maxTotal = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;

  return (
    <div className="drill-down__section">
      <div className="drill-down__legend">
        {SEGMENT_ORDER.filter((t) => rows.some((r) => (r.counts[t] ?? 0) > 0)).map(
          (t) => (
            <span key={t} className="drill-down__legend-item">
              <span
                className="drill-down__legend-swatch"
                style={{ background: TYPE_COLOR[t] }}
              />
              {t}
            </span>
          ),
        )}
      </div>
      <ul className="drill-down__engagements">
        {rows.map((row) => {
          const widthPx = (row.total / maxTotal) * BAR_WIDTH;
          let xCursor = 0;
          return (
            <li
              key={row.target}
              className="drill-down__engagement-row"
              onClick={() => onTargetClick(row.target)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTargetClick(row.target);
                }
              }}
            >
              <span className="drill-down__engagement-target">
                {roleName(row.target)}
              </span>
              <svg
                className="engagements-bar"
                width={BAR_WIDTH}
                height={BAR_HEIGHT}
                role="img"
                aria-label={`${row.total} engagements with ${row.target}`}
              >
                <rect
                  x={0}
                  y={0}
                  width={BAR_WIDTH}
                  height={BAR_HEIGHT}
                  className="engagements-bar__track"
                />
                {SEGMENT_ORDER.map((t) => {
                  const n = row.counts[t] ?? 0;
                  if (n === 0) return null;
                  const segWidth = (n / row.total) * widthPx;
                  const x = xCursor;
                  xCursor += segWidth;
                  return (
                    <rect
                      key={t}
                      x={x}
                      y={0}
                      width={segWidth}
                      height={BAR_HEIGHT}
                      fill={TYPE_COLOR[t]}
                    >
                      <title>{`${n} ${t}`}</title>
                    </rect>
                  );
                })}
              </svg>
              <span className="drill-down__engagement-total">{row.total}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
