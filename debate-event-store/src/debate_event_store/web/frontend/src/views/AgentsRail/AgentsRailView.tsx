import { observer } from "mobx-react-lite";
import { useResolve } from "@/tsyringe-hooks/useResolve";
import {
  AgentRosterStore,
  TOKEN_AgentRosterStore,
} from "@/stores/AgentRosterStore";
import { FiltersStore, TOKEN_FiltersStore } from "@/stores/FiltersStore";
import { DrillDownStore, TOKEN_DrillDownStore } from "@/stores/DrillDownStore";
import { AgentCard } from "./AgentCard";

export const AgentsRailView = observer(() => {
  const roster = useResolve<AgentRosterStore>(TOKEN_AgentRosterStore);
  const filters = useResolve<FiltersStore>(TOKEN_FiltersStore);
  const drill = useResolve<DrillDownStore>(TOKEN_DrillDownStore);

  const onClick = (agent_id: string) => {
    // Toggle the focused-agent filter (existing Phase 4 behaviour) AND open
    // the Phase 7 drill-down. Both are intentional: filter scopes the stream,
    // overlay drills into one agent.
    if (filters.focusedAgent === agent_id) filters.setFocusedAgent(null);
    else filters.setFocusedAgent(agent_id);
    drill.open(agent_id);
  };

  if (roster.agents.size === 0) {
    return (
      <div className="agents-rail">
        <div className="agents-rail__header">Agents</div>
        <div className="agents-rail__empty">no agents yet</div>
      </div>
    );
  }

  return (
    <div className="agents-rail">
      <div className="agents-rail__header">
        <span>Agents</span>
        <span className="agents-rail__count">{roster.agents.size}</span>
      </div>
      {roster.groups.map((group, idx) => (
        <div
          key={group.label ?? `g${idx}`}
          className={
            "agents-rail__group" +
            (group.label ? " agents-rail__group--pair" : "")
          }
          data-label={group.label ?? undefined}
        >
          {group.agentIds.map((id) => {
            const agent = roster.agents.get(id);
            if (!agent) return null;
            const budget = roster.budgetFor(id);
            return (
              <AgentCard
                key={id}
                agent={agent}
                budgetUsed={budget.used}
                budgetLimit={budget.limit}
                isFocused={filters.focusedAgent === id}
                onClick={onClick}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
});
