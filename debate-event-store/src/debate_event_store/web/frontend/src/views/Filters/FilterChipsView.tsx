import { observer } from "mobx-react-lite";
import { useResolve } from "@/tsyringe-hooks/useResolve";
import { FiltersStore, TOKEN_FiltersStore } from "@/stores/FiltersStore";
import { ALL_EVENT_TYPES, TYPE_COLOR } from "@/lib/eventTypes";

export const FilterChipsView = observer(() => {
  const filters = useResolve<FiltersStore>(TOKEN_FiltersStore);

  return (
    <div className="filter-chips">
      {ALL_EVENT_TYPES.map((t) => {
        const on = filters.isTypeEnabled(t);
        return (
          <button
            key={t}
            type="button"
            className={"filter-chip" + (on ? " filter-chip--on" : "")}
            onClick={() => filters.toggleType(t)}
          >
            <span
              className="filter-chip__swatch"
              style={{ background: TYPE_COLOR[t] }}
            />
            {t}
          </button>
        );
      })}
      <div className="filter-chips__right">
        {filters.focusedAgent && (
          <button
            type="button"
            className="filter-chip filter-chip--clear"
            onClick={() => filters.setFocusedAgent(null)}
            title="Clear focused agent"
          >
            focus: @{filters.focusedAgent} ✕
          </button>
        )}
        <button
          type="button"
          className={
            "filter-chip filter-chip--auto" +
            (filters.autoScroll ? " filter-chip--on" : "")
          }
          onClick={() => filters.setAutoScroll(!filters.autoScroll)}
        >
          ⤓ Auto-scroll
        </button>
      </div>
    </div>
  );
});
