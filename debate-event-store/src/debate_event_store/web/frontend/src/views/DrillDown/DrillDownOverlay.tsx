import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useResolve } from "@/tsyringe-hooks/useResolve";
import {
  DrillDownStore,
  TOKEN_DrillDownStore,
  DRILL_DOWN_TABS,
  type DrillDownTabId,
} from "@/stores/DrillDownStore";
import {
  EventStreamStore,
  TOKEN_EventStreamStore,
} from "@/views/EventStream/EventStreamStore";
import { MomentumStore, TOKEN_MomentumStore } from "@/stores/MomentumStore";
import { roleColor, roleName } from "@/lib/roleHues";
import { IdentityTab } from "./IdentityTab";
import { TimelineTab } from "./TimelineTab";
import { EngagementsTab } from "./EngagementsTab";
import { QualityTab } from "./QualityTab";
import { HeatmapTab } from "./HeatmapTab";

// Inner body: only mounted when the overlay is open. By gating the
// subscription to `stream.events` / `momentum.currentScores` behind this
// component, MobX does NOT re-render the closed overlay on every SSE event.
const DrillDownBody = observer((props: { focused: string }) => {
  const { focused } = props;
  const drill = useResolve<DrillDownStore>(TOKEN_DrillDownStore);
  const stream = useResolve<EventStreamStore>(TOKEN_EventStreamStore);
  const momentum = useResolve<MomentumStore>(TOKEN_MomentumStore);
  const tab: DrillDownTabId = drill.activeTab;
  const events = stream.events;

  const renderTab = () => {
    switch (tab) {
      case "identity":
        return (
          <IdentityTab
            agentId={focused}
            events={events}
            currentScore={momentum.currentScores.get(focused)}
          />
        );
      case "timeline":
        return <TimelineTab agentId={focused} events={events} />;
      case "engagements":
        return (
          <EngagementsTab
            agentId={focused}
            events={events}
            onTargetClick={(target) => drill.open(target)}
          />
        );
      case "quality":
        return <QualityTab agentId={focused} events={events} />;
      case "heatmap":
        return (
          <HeatmapTab
            agentId={focused}
            events={events}
            onTargetClick={(target) => drill.open(target)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <header
        className="drill-down__head"
        style={{ ["--agent-color" as string]: roleColor(focused) }}
      >
        <span
          className="drill-down__head-swatch"
          style={{ background: roleColor(focused) }}
          aria-hidden="true"
        />
        <div className="drill-down__head-titles">
          <h2 className="drill-down__head-name">{roleName(focused)}</h2>
          <span className="drill-down__head-id">@{focused}</span>
        </div>
        <button
          type="button"
          className="drill-down__close"
          onClick={() => drill.close()}
          aria-label="Close drill-down"
        >
          ×
        </button>
      </header>
      <nav className="drill-down__tabs" role="tablist">
        {DRILL_DOWN_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={
              "drill-down__tab" +
              (tab === t.id ? " drill-down__tab--active" : "")
            }
            onClick={() => drill.setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="drill-down__body">{renderTab()}</div>
    </>
  );
});

export const DrillDownOverlay = observer(() => {
  const drill = useResolve<DrillDownStore>(TOKEN_DrillDownStore);

  useEffect(() => {
    if (!drill.isOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") drill.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drill.isOpen, drill]);

  const focused = drill.focusedAgentId;

  return (
    <>
      <div
        className={
          "drill-down__backdrop" +
          (drill.isOpen ? " drill-down__backdrop--open" : "")
        }
        onClick={() => drill.close()}
        aria-hidden="true"
      />
      <aside
        className={"drill-down" + (drill.isOpen ? " drill-down--open" : "")}
        role="dialog"
        aria-modal="true"
        aria-label="Agent drill-down"
        aria-hidden={!drill.isOpen}
      >
        {drill.isOpen && focused && <DrillDownBody focused={focused} />}
      </aside>
    </>
  );
});
