import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import type { AgentState } from "@/stores/AgentRosterStore";
import { roleColor, roleName } from "@/lib/roleHues";
import type { EventType } from "@/lib/eventTypes";

interface AgentCardProps {
  agent: AgentState;
  budgetUsed: number;
  budgetLimit: number;
  isFocused: boolean;
  onClick: (agent_id: string) => void;
}

const CHIP_ORDER: readonly EventType[] = [
  "POSITION",
  "ARGUMENT",
  "REBUTTAL",
  "CRITIQUE",
  "CONCEDE",
  "CONVERGENCE",
  "GROUNDING",
  "ROLE",
  "MODERATOR",
];

const CHIP_LABEL: Partial<Record<EventType, string>> = {
  POSITION: "POS",
  ARGUMENT: "ARG",
  REBUTTAL: "REB",
  CRITIQUE: "CRIT",
  CONCEDE: "CONC",
  CONVERGENCE: "CONV",
  GROUNDING: "GND",
  ROLE: "ROLE",
  MODERATOR: "MOD",
};

export const AgentCard = observer((props: AgentCardProps) => {
  const { agent, budgetUsed, budgetLimit, isFocused, onClick } = props;
  const color = roleColor(agent.agent_id);
  const pct = budgetLimit > 0 ? Math.min(100, (budgetUsed / budgetLimit) * 100) : 0;

  const [pulse, setPulse] = useState(false);
  const lastSeenRef = useRef<number>(agent.lastEventAt);
  useEffect(() => {
    if (agent.lastEventAt !== lastSeenRef.current) {
      lastSeenRef.current = agent.lastEventAt;
      setPulse(true);
      const t = window.setTimeout(() => setPulse(false), 600);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [agent.lastEventAt]);

  const chips = CHIP_ORDER.flatMap((t) => {
    const n = agent.typeCounts[t];
    if (!n) return [];
    return [
      <span key={t} className="agent-card__chip">
        {n} {CHIP_LABEL[t] ?? t}
      </span>,
    ];
  });

  return (
    <div
      className={
        "agent-card" +
        (isFocused ? " agent-card--active" : "") +
        (pulse ? " agent-card--pulse" : "")
      }
      style={{ ["--agent-color" as string]: color }}
      onClick={() => onClick(agent.agent_id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(agent.agent_id);
        }
      }}
    >
      <div className="agent-card__row">
        <span className="agent-card__dot" />
        <span className="agent-card__name">{roleName(agent.agent_id)}</span>
        <span className="agent-card__id">{agent.agent_id}</span>
      </div>
      <div className="agent-card__meta">
        <div className="agent-card__budget-bar">
          <div className="agent-card__budget-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="agent-card__budget-num">
          {budgetUsed} / {budgetLimit}
        </span>
      </div>
      {chips.length > 0 && <div className="agent-card__chips">{chips}</div>}
    </div>
  );
});
