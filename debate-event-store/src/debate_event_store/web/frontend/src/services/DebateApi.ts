import { injectable } from "tsyringe";
import type {
  DebateStatus,
  EventListResponse,
  ModeratorResponse,
} from "./wireTypes";

export const TOKEN_DebateApi = Symbol("DebateApi");

export type { ModeratorResponse } from "./wireTypes";

@injectable()
export class DebateApi {
  async status(): Promise<DebateStatus> {
    const r = await fetch("/api/status");
    if (!r.ok) throw new Error(`status ${r.status}`);
    return (await r.json()) as DebateStatus;
  }

  async events(): Promise<EventListResponse> {
    const r = await fetch("/api/events");
    if (!r.ok) throw new Error(`status ${r.status}`);
    return (await r.json()) as EventListResponse;
  }

  async moderator(text: string): Promise<ModeratorResponse> {
    const r = await fetch("/api/moderator", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return (await r.json()) as ModeratorResponse;
  }
}
