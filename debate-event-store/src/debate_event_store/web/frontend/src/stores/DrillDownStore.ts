import { injectable } from "tsyringe";
import { makeAutoObservable } from "mobx";

export const TOKEN_DrillDownStore = Symbol("DrillDownStore");

export type DrillDownTabId =
  | "identity"
  | "timeline"
  | "engagements"
  | "quality"
  | "heatmap";

export const DRILL_DOWN_TABS: readonly { id: DrillDownTabId; label: string }[] = [
  { id: "identity", label: "Identity" },
  { id: "timeline", label: "Timeline" },
  { id: "engagements", label: "Engagements" },
  { id: "quality", label: "Quality" },
  { id: "heatmap", label: "Heatmap" },
];

@injectable()
export class DrillDownStore {
  private _focusedAgentId: string | null = null;
  // Remember the last selected tab across open/close so the operator's place is
  // preserved when they pop the overlay back open on the same or another agent.
  private _activeTab: DrillDownTabId = "timeline";

  constructor() {
    makeAutoObservable(this);
  }

  open(id: string, tab?: DrillDownTabId): void {
    this._focusedAgentId = id;
    if (tab) this._activeTab = tab;
  }

  close(): void {
    this._focusedAgentId = null;
  }

  setActiveTab(tab: DrillDownTabId): void {
    this._activeTab = tab;
  }

  get isOpen(): boolean {
    return this._focusedAgentId !== null;
  }

  get focusedAgentId(): string | null {
    return this._focusedAgentId;
  }

  get activeTab(): DrillDownTabId {
    return this._activeTab;
  }
}
