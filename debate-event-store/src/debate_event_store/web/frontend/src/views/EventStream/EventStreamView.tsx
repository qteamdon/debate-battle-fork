import { observer } from "mobx-react-lite";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useResolve } from "@/tsyringe-hooks/useResolve";
import { TOKEN_EventStreamStore, EventStreamStore } from "./EventStreamStore";
import { FiltersStore, TOKEN_FiltersStore } from "@/stores/FiltersStore";
import {
  TimelineViewStore,
  TOKEN_TimelineViewStore,
} from "@/stores/TimelineViewStore";
import { eventType, mentionsOf, TYPE_COLOR } from "@/lib/eventTypes";
import { roleColor } from "@/lib/roleHues";
import type { DebateEvent } from "@/services/wireTypes";

const EventItem = observer((props: { event: DebateEvent }) => {
  const { event } = props;
  const type = eventType(event.text);
  const mentions = mentionsOf(event.text);
  const typeColor = TYPE_COLOR[type];
  const agentColor = roleColor(event.agent_id);

  const ref = useRef<HTMLLIElement | null>(null);
  const [entered, setEntered] = useState(false);
  useLayoutEffect(() => {
    // Two-frame technique so the browser registers the "before" state before
    // the "after" class flips, otherwise the transition won't trigger.
    let r2: number | null = null;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      if (r2 !== null) cancelAnimationFrame(r2);
    };
  }, []);

  return (
    <li
      ref={ref}
      data-position={event.position}
      className={
        "event-stream__item" +
        ` event-stream__item--${type.toLowerCase()}` +
        (entered ? " event-stream__item--enter-active" : " event-stream__item--enter")
      }
      style={{
        ["--type-color" as string]: typeColor,
        ["--agent-color" as string]: agentColor,
      }}
    >
      <div className="event-stream__head">
        <span className="event-stream__pos">#{event.position}</span>
        <span className="event-stream__type">{type}</span>
        <span className="event-stream__agent">
          <span className="event-stream__agent-dot" />
          {event.agent_id}
        </span>
        {mentions.map((m) => (
          <span key={m} className="event-stream__mention">
            → @{m}
          </span>
        ))}
      </div>
      <div className="event-stream__text">{event.text}</div>
    </li>
  );
});

export const EventStreamView = observer(() => {
  const store = useResolve<EventStreamStore>(TOKEN_EventStreamStore);
  const filters = useResolve<FiltersStore>(TOKEN_FiltersStore);
  const timelineView = useResolve<TimelineViewStore>(TOKEN_TimelineViewStore);
  const listRef = useRef<HTMLUListElement | null>(null);
  // Pinned by a click on a takedown / tick / event in another view. While
  // pinned, new events do NOT yank the scroll back to the top — that was
  // making the click navigation unusable because the next live event would
  // immediately steal the operator's spot. Cleared when the user scrolls
  // back to (or near) the top of the list themselves.
  const pinnedRef = useRef(false);

  const visible = store.eventsNewestFirst.filter((e) => filters.passes(e));
  const topPos = visible.length > 0 ? visible[0].position : 0;

  useEffect(() => {
    if (!filters.autoScroll) return;
    if (pinnedRef.current) return;
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [topPos, filters.autoScroll]);

  const focusPos = timelineView.focusedStreamPosition;
  useEffect(() => {
    if (focusPos === null) return;
    const list = listRef.current;
    if (!list) return;
    const target = list.querySelector(
      `li[data-position="${focusPos}"]`,
    ) as HTMLElement | null;
    if (target) {
      pinnedRef.current = true;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("event-stream__item--focused");
      window.setTimeout(() => target.classList.remove("event-stream__item--focused"), 1500);
    }
    timelineView.clearStreamScrollRequest();
  }, [focusPos, timelineView]);

  // Releasing the pin: when the user scrolls back near the top, autoscroll
  // resumes. 24px of slack so a fractional scrollTop after a momentum scroll
  // doesn't leave us stuck pinned.
  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    if (pinnedRef.current && list.scrollTop <= 24) {
      pinnedRef.current = false;
    }
  };

  return (
    <div className="event-stream">
      <div className="event-stream__head-bar">
        <h2>Event stream</h2>
        <span className="event-stream__count">
          {visible.length}
          {visible.length !== store.events.length && (
            <span className="event-stream__count-total"> / {store.events.length}</span>
          )}
          <span className="event-stream__tip">tip: {store.tip}</span>
        </span>
      </div>
      <ul ref={listRef} onScroll={onScroll} className="event-stream__list">
        {visible.map((e) => (
          <EventItem key={e.position} event={e} />
        ))}
        {visible.length === 0 && (
          <li className="event-stream__empty">
            {store.events.length === 0
              ? "no events yet — waiting for SSE"
              : "no events match current filters"}
          </li>
        )}
      </ul>
    </div>
  );
});
