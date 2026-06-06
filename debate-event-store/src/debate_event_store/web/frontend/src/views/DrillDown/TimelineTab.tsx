import { observer } from "mobx-react-lite";
import type { DebateEvent } from "@/services/wireTypes";
import { eventType, mentionsOf, TYPE_COLOR } from "@/lib/eventTypes";

interface Props {
  agentId: string;
  events: readonly DebateEvent[];
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString();
}

export const TimelineTab = observer((props: Props) => {
  const { agentId, events } = props;
  const mine = events
    .filter((e) => e.agent_id === agentId)
    .slice()
    .sort((a, b) => a.position - b.position);

  if (mine.length === 0) {
    return (
      <div className="drill-down__section">
        <div className="drill-down__empty">No events from @{agentId} yet.</div>
      </div>
    );
  }

  return (
    <div className="drill-down__section">
      <ol className="drill-down__timeline">
        {mine.map((e) => {
          const t = eventType(e.text);
          const color = TYPE_COLOR[t];
          const mentions = mentionsOf(e.text).filter((m) => m !== agentId);
          return (
            <li
              key={e.position}
              className="drill-down__timeline-item"
              style={{ ["--type-color" as string]: color }}
            >
              <div className="drill-down__timeline-head">
                <span className="drill-down__timeline-pos">#{e.position}</span>
                <span className="drill-down__timeline-type">{t}</span>
                <span className="drill-down__timeline-time">{fmtTime(e.timestamp)}</span>
                {mentions.map((m) => (
                  <span key={m} className="drill-down__timeline-mention">
                    → @{m}
                  </span>
                ))}
              </div>
              <div className="drill-down__timeline-text">{e.text}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
});
