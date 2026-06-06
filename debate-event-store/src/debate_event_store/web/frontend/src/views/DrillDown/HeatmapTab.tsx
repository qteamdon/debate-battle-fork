import { observer } from "mobx-react-lite";
import type { DebateEvent } from "@/services/wireTypes";
import { buildHeatmapRow, type HeatmapCell } from "@/lib/qualityChecks";
import { roleName } from "@/lib/roleHues";

interface Props {
  agentId: string;
  events: readonly DebateEvent[];
  onTargetClick: (target: string) => void;
}

// Map a net score to an HSL colour: green for positive (yielding/converging),
// red for negative (attacking), grey for zero. Saturation ramps with magnitude
// so a single rebuttal reads visibly different from a sustained barrage.
function cellColor(net: number, maxMagnitude: number): string {
  if (net === 0) return "rgba(255, 255, 255, 0.06)";
  const ratio = maxMagnitude > 0 ? Math.min(1, Math.abs(net) / maxMagnitude) : 0;
  const lightness = 28 + ratio * 22;
  const saturation = 50 + ratio * 30;
  const hue = net > 0 ? 140 : 5;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function cellTitle(cell: HeatmapCell): string {
  const parts: string[] = [];
  if (cell.rebuttalCount) parts.push(`${cell.rebuttalCount} rebuttal`);
  if (cell.critiqueCount) parts.push(`${cell.critiqueCount} critique`);
  if (cell.concedeCount) parts.push(`${cell.concedeCount} concede`);
  if (cell.convergeCount) parts.push(`${cell.convergeCount} converge`);
  if (cell.mentionCount) parts.push(`${cell.mentionCount} mention`);
  const head = `${cell.source} → ${cell.target}`;
  const body = parts.length === 0 ? "no interactions" : parts.join(", ");
  return `${head}\n${body}\nnet: ${cell.net > 0 ? "+" : ""}${cell.net}`;
}

export const HeatmapTab = observer((props: Props) => {
  const { agentId, events, onTargetClick } = props;
  const cells = buildHeatmapRow(agentId, events);

  if (cells.length === 0) {
    return (
      <div className="drill-down__section">
        <div className="drill-down__empty">
          No interaction targets yet for @{agentId}.
        </div>
      </div>
    );
  }

  const maxMagnitude = cells.reduce((m, c) => Math.max(m, Math.abs(c.net)), 0);

  return (
    <div className="drill-down__section">
      <div className="drill-down__heatmap-legend">
        <span className="drill-down__heatmap-legend-item">
          <span
            className="drill-down__heatmap-legend-swatch"
            style={{ background: cellColor(-Math.max(1, maxMagnitude), maxMagnitude) }}
          />
          attacks
        </span>
        <span className="drill-down__heatmap-legend-item">
          <span
            className="drill-down__heatmap-legend-swatch"
            style={{ background: cellColor(0, maxMagnitude) }}
          />
          neutral
        </span>
        <span className="drill-down__heatmap-legend-item">
          <span
            className="drill-down__heatmap-legend-swatch"
            style={{ background: cellColor(Math.max(1, maxMagnitude), maxMagnitude) }}
          />
          yields
        </span>
      </div>
      <div className="heatmap-row" role="row" aria-label={`@${agentId} interaction heatmap`}>
        <span className="heatmap-row__label">@{agentId}</span>
        <div className="heatmap-row__cells">
          {cells.map((cell) => (
            <button
              key={cell.target}
              type="button"
              className="heatmap-cell"
              style={{ background: cellColor(cell.net, maxMagnitude) }}
              onClick={() => onTargetClick(cell.target)}
              title={cellTitle(cell)}
              aria-label={cellTitle(cell)}
            >
              <span className="heatmap-cell__target">{roleName(cell.target)}</span>
              <span className="heatmap-cell__net">
                {cell.net > 0 ? "+" : ""}
                {cell.net}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
