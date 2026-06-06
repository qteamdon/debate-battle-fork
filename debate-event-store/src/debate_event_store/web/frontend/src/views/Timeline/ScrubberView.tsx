import { observer } from "mobx-react-lite";
import { useResolve } from "@/tsyringe-hooks/useResolve";
import {
  TimelineViewStore,
  TOKEN_TimelineViewStore,
} from "@/stores/TimelineViewStore";
import {
  EventStreamStore,
  TOKEN_EventStreamStore,
} from "@/views/EventStream/EventStreamStore";

interface Props {
  firstEventMs: number;
  nowMs: number;
}

export const ScrubberView = observer((props: Props) => {
  const { firstEventMs, nowMs } = props;
  const view = useResolve<TimelineViewStore>(TOKEN_TimelineViewStore);
  const stream = useResolve<EventStreamStore>(TOKEN_EventStreamStore);

  // Normalise to ms-since-debate-start. Avoids exposing absolute wall-clock
  // ms as the slider's min/max (which the browser would print as "the two
  // nearest values are 1778827200000 and ...") and side-steps any residual
  // min>max race if firstEventMs ever exceeds nowMs.
  const span = Math.max(1000, nowMs - firstEventMs);
  const sliderMin = 0;
  const sliderMax = span;
  const rawValue = view.scrubberPosition ?? nowMs;
  const sliderValue = Math.max(
    sliderMin,
    Math.min(sliderMax, rawValue - firstEventMs),
  );
  const min = sliderMin;
  const max = sliderMax;
  const value = sliderValue;

  // Find the event whose timestamp is closest to (and at or before) the
  // scrubber position. Returns null if no events exist.
  function nearestEventAt(ms: number): number | null {
    const events = stream.events;
    if (events.length === 0) return null;
    const targetSec = ms / 1000;
    let best = events[0];
    let bestDist = Math.abs(best.timestamp - targetSec);
    for (const e of events) {
      const d = Math.abs(e.timestamp - targetSec);
      if (d < bestDist) {
        best = e;
        bestDist = d;
      }
    }
    return best.position;
  }

  return (
    <div className="timeline__scrubber">
      <input
        className="timeline__scrubber-range"
        type="range"
        min={min}
        max={max}
        step={Math.max(1, Math.round(span / 1000))}
        value={value}
        onChange={(e) => {
          const offset = Number(e.currentTarget.value);
          // Snap to live when the user drags to the right edge so the chart
          // resumes auto-scroll without a separate "back to live" click.
          if (offset >= max - 500) {
            view.backToLive();
            return;
          }
          // Convert offset back to absolute ms for downstream consumers.
          const absoluteMs = offset + firstEventMs;
          view.setScrubber(absoluteMs);
          // Spec: dragging the scrubber syncs the event stream to the
          // scrubber position. Find the nearest event by wall-clock time.
          const pos = nearestEventAt(absoluteMs);
          if (pos !== null) view.requestStreamScroll(pos);
        }}
      />
      <div className="timeline__scrubber-meta">
        {view.isLive
          ? "live"
          : new Date(value + firstEventMs).toLocaleTimeString()}
      </div>
    </div>
  );
});
