import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { useResolve } from "@/tsyringe-hooks/useResolve";
import {
  ModeratorInputStore,
  TOKEN_ModeratorInputStore,
} from "@/stores/ModeratorInputStore";

export const ModeratorFooterView = observer(() => {
  const store = useResolve<ModeratorInputStore>(TOKEN_ModeratorInputStore);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (store.focusRequested > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [store.focusRequested]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void store.send();
    }
  };

  const status = store.status;
  const lastResponse = store.lastResponse as
    | { success?: boolean; position?: number; error?: string }
    | null;

  return (
    <div className="moderator-footer">
      <span className="moderator-footer__label">⌘ Moderator</span>
      <input
        ref={inputRef}
        className="moderator-footer__input"
        value={store.text}
        onChange={(e) => store.setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Inject an event into the debate stream… (Enter to send)"
        disabled={status === "sending"}
      />
      <button
        type="button"
        className="moderator-footer__send"
        onClick={() => void store.send()}
        disabled={status === "sending" || store.text.trim().length === 0}
      >
        {status === "sending" ? "Sending…" : "Send →"}
      </button>
      <span className="moderator-footer__kbd">⌘K</span>
      {status === "success" && lastResponse?.position !== undefined && (
        <span className="moderator-footer__status moderator-footer__status--ok">
          sent · pos #{lastResponse.position}
        </span>
      )}
      {status === "error" && (
        <span className="moderator-footer__status moderator-footer__status--err">
          error: {store.lastError ?? "unknown"}
        </span>
      )}
    </div>
  );
});
