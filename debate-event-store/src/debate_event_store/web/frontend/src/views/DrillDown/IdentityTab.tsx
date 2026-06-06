import { observer } from "mobx-react-lite";
import type { DebateEvent } from "@/services/wireTypes";
import { roleColor, roleName } from "@/lib/roleHues";
import { eventType, type EventType } from "@/lib/eventTypes";

interface Props {
  agentId: string;
  events: readonly DebateEvent[];
  currentScore: number | undefined;
}

export const IdentityTab = observer((props: Props) => {
  const { agentId, events, currentScore } = props;
  const mine = events.filter((e) => e.agent_id === agentId);
  // The agent's POSITION event is the closest thing to a "stance brief" the
  // stream contains. Roles/alignments are operator-side data and never
  // appear in the stream by design — don't claim they're missing, just
  // surface what we actually have.
  const positionEvent = mine.find((e) => eventType(e.text) === "POSITION");
  const positionText = positionEvent
    ? positionEvent.text.replace(/^POSITION\s*:\s*/i, "").trim()
    : null;
  const roleEvent = mine.find((e) => eventType(e.text) === "ROLE");
  const roleText = roleEvent
    ? roleEvent.text.replace(/^ROLE\s*:\s*/i, "").trim()
    : null;
  const firstSeen = mine.length > 0 ? mine[0].timestamp : null;
  const lastSeen = mine.length > 0 ? mine[mine.length - 1].timestamp : null;

  // Event-type breakdown.
  const typeCounts = new Map<EventType, number>();
  for (const e of mine) {
    const t = eventType(e.text);
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const breakdown = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="drill-down__section">
      <div className="drill-down__identity-head">
        <span
          className="drill-down__swatch"
          style={{ background: roleColor(agentId) }}
          aria-hidden="true"
        />
        <div className="drill-down__identity-name">
          <div className="drill-down__identity-display">{roleName(agentId)}</div>
          <div className="drill-down__identity-id">@{agentId}</div>
        </div>
      </div>
      <dl className="drill-down__defs">
        <div className="drill-down__def">
          <dt>Events published</dt>
          <dd>{mine.length}</dd>
        </div>
        <div className="drill-down__def">
          <dt>Current momentum</dt>
          <dd>
            {typeof currentScore === "number" ? currentScore.toFixed(2) : "0.00"}
          </dd>
        </div>
        {firstSeen !== null && (
          <div className="drill-down__def">
            <dt>First seen</dt>
            <dd>{new Date(firstSeen * 1000).toLocaleTimeString()}</dd>
          </div>
        )}
        {lastSeen !== null && lastSeen !== firstSeen && (
          <div className="drill-down__def">
            <dt>Last activity</dt>
            <dd>{new Date(lastSeen * 1000).toLocaleTimeString()}</dd>
          </div>
        )}
      </dl>

      {breakdown.length > 0 && (
        <div className="drill-down__role-brief">
          <div className="drill-down__role-brief-label">Event-type breakdown</div>
          <div className="drill-down__role-brief-body">
            {breakdown.map(([t, c]) => `${t} ×${c}`).join(" · ")}
          </div>
        </div>
      )}

      {positionText && (
        <div className="drill-down__role-brief">
          <div className="drill-down__role-brief-label">Stated position</div>
          <div className="drill-down__role-brief-body">{positionText}</div>
        </div>
      )}

      {roleText && (
        <div className="drill-down__role-brief">
          <div className="drill-down__role-brief-label">Self-declared role</div>
          <div className="drill-down__role-brief-body">{roleText}</div>
        </div>
      )}

      {!positionText && !roleText && mine.length === 0 && (
        <div className="drill-down__role-brief">
          <div className="drill-down__role-brief-body">
            @{agentId} hasn't published yet.
          </div>
        </div>
      )}
    </div>
  );
});
