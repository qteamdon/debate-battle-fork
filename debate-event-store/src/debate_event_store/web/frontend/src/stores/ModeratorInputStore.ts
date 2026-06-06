import { inject, injectable } from "tsyringe";
import { makeAutoObservable, runInAction } from "mobx";
import { DebateApi, TOKEN_DebateApi } from "@/services/DebateApi";

export const TOKEN_ModeratorInputStore = Symbol("ModeratorInputStore");

export type ModeratorSendStatus = "idle" | "sending" | "success" | "error";

@injectable()
export class ModeratorInputStore {
  private _text = "";
  private _status: ModeratorSendStatus = "idle";
  private _lastError: string | null = null;
  private _lastResponse: unknown = null;
  private _focusRequested = 0;

  constructor(@inject(TOKEN_DebateApi) private readonly _api: DebateApi) {
    makeAutoObservable(this);
  }

  get text(): string {
    return this._text;
  }

  get status(): ModeratorSendStatus {
    return this._status;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  get lastResponse(): unknown {
    return this._lastResponse;
  }

  get focusRequested(): number {
    return this._focusRequested;
  }

  setText(value: string): void {
    this._text = value;
    if (this._status === "success" || this._status === "error") {
      this._status = "idle";
    }
  }

  focus(): void {
    this._focusRequested += 1;
  }

  async send(): Promise<void> {
    const text = this._text.trim();
    if (!text) return;
    if (this._status === "sending") return;
    this._status = "sending";
    this._lastError = null;
    try {
      const resp = await this._api.moderator(text);
      // runInAction needed because we resume after an awaited fetch (the
      // automatic action-wrapping from makeAutoObservable does not span the
      // microtask boundary).
      runInAction(() => {
        this._lastResponse = resp;
        if (resp && typeof resp === "object" && (resp as { success?: boolean }).success === false) {
          this._status = "error";
          const err = (resp as { error?: string }).error;
          this._lastError = err ?? "moderator inject failed";
        } else {
          this._status = "success";
          this._text = "";
        }
      });
    } catch (e) {
      runInAction(() => {
        this._status = "error";
        this._lastError = e instanceof Error ? e.message : String(e);
      });
    }
  }
}
