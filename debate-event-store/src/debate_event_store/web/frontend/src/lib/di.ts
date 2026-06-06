import { DependencyContainer } from "tsyringe";
import { SseClient, TOKEN_SseClient } from "@/services/SseClient";
import { DebateApi, TOKEN_DebateApi } from "@/services/DebateApi";
import { ConnectionStore, TOKEN_ConnectionStore } from "@/stores/ConnectionStore";
import {
  AgentRosterStore,
  TOKEN_AgentRosterStore,
} from "@/stores/AgentRosterStore";
import { FiltersStore, TOKEN_FiltersStore } from "@/stores/FiltersStore";
import {
  ModeratorInputStore,
  TOKEN_ModeratorInputStore,
} from "@/stores/ModeratorInputStore";
import {
  EventStreamStore,
  TOKEN_EventStreamStore,
} from "@/views/EventStream/EventStreamStore";
import {
  D3LayoutService,
  TOKEN_D3LayoutService,
} from "@/services/D3LayoutService";
import { MomentumStore, TOKEN_MomentumStore } from "@/stores/MomentumStore";
import {
  TimelineViewStore,
  TOKEN_TimelineViewStore,
} from "@/stores/TimelineViewStore";
import {
  ForceSimulationService,
  TOKEN_ForceSimulationService,
} from "@/services/ForceSimulationService";
import {
  PositionGraphStore,
  TOKEN_PositionGraphStore,
} from "@/stores/PositionGraphStore";
import { DrillDownStore, TOKEN_DrillDownStore } from "@/stores/DrillDownStore";
import { SummaryStore, TOKEN_SummaryStore } from "@/stores/SummaryStore";

export function configureContainer(container: DependencyContainer): void {
  container.registerSingleton<SseClient>(TOKEN_SseClient, SseClient);
  container.registerSingleton<DebateApi>(TOKEN_DebateApi, DebateApi);
  container.registerSingleton<ConnectionStore>(TOKEN_ConnectionStore, ConnectionStore);
  container.registerSingleton<EventStreamStore>(
    TOKEN_EventStreamStore,
    EventStreamStore,
  );
  container.registerSingleton<AgentRosterStore>(
    TOKEN_AgentRosterStore,
    AgentRosterStore,
  );
  container.registerSingleton<FiltersStore>(TOKEN_FiltersStore, FiltersStore);
  container.registerSingleton<ModeratorInputStore>(
    TOKEN_ModeratorInputStore,
    ModeratorInputStore,
  );
  container.registerSingleton<D3LayoutService>(
    TOKEN_D3LayoutService,
    D3LayoutService,
  );
  container.registerSingleton<MomentumStore>(TOKEN_MomentumStore, MomentumStore);
  container.registerSingleton<TimelineViewStore>(
    TOKEN_TimelineViewStore,
    TimelineViewStore,
  );
  container.registerSingleton<ForceSimulationService>(
    TOKEN_ForceSimulationService,
    ForceSimulationService,
  );
  container.registerSingleton<PositionGraphStore>(
    TOKEN_PositionGraphStore,
    PositionGraphStore,
  );
  // DrillDownStore is lazy — it owns only UI focus state and has no autorun,
  // so resolution happens on first overlay open via useResolve.
  container.registerSingleton<DrillDownStore>(TOKEN_DrillDownStore, DrillDownStore);
  container.registerSingleton<SummaryStore>(TOKEN_SummaryStore, SummaryStore);

  // Eagerly resolve stores that subscribe to SseClient in their constructors so
  // they are listening before start() fires the first snapshot envelope.
  container.resolve<ConnectionStore>(TOKEN_ConnectionStore);
  container.resolve<EventStreamStore>(TOKEN_EventStreamStore);
  // MomentumStore's autorun must subscribe before snapshot lands so it back-
  // fills the chart on first load.
  container.resolve<MomentumStore>(TOKEN_MomentumStore);
  // PositionGraphStore's autorun reads events + currentScores; resolve early
  // so it begins tracking before the first snapshot lands.
  container.resolve<PositionGraphStore>(TOKEN_PositionGraphStore);
  // SummaryStore subscribes to the SSE summary channel in its constructor.
  // Resolve early so subscription is registered before the first summary
  // envelope arrives — otherwise the panel stays "Awaiting summariser..."
  // even after a real summary has been broadcast.
  container.resolve<SummaryStore>(TOKEN_SummaryStore);
}
