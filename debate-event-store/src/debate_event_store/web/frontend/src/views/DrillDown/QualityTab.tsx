import { observer } from "mobx-react-lite";
import type { DebateEvent } from "@/services/wireTypes";
import { runChecksForAgent } from "@/lib/qualityChecks";

interface Props {
  agentId: string;
  events: readonly DebateEvent[];
}

export const QualityTab = observer((props: Props) => {
  const { agentId, events } = props;
  const checks = runChecksForAgent(agentId, events);
  const passed = checks.filter((c) => c.passed).length;

  return (
    <div className="drill-down__section">
      <div className="drill-down__quality-head">
        Passed {passed} / {checks.length}
      </div>
      <ul className="drill-down__quality">
        {checks.map((c) => (
          <li
            key={c.id}
            className={
              "quality-check" +
              (c.passed ? " quality-check--pass" : " quality-check--fail")
            }
          >
            <span
              className="quality-check__glyph"
              aria-label={c.passed ? "passed" : "failed"}
            >
              {c.passed ? "✓" : "✗"}
            </span>
            <div className="quality-check__body">
              <div className="quality-check__label">{c.label}</div>
              {c.detail && <div className="quality-check__detail">{c.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
});
