import { useLayoutEffect, useState } from "react";
import type { Takedown } from "@/stores/MomentumStore";

interface Props {
  takedown: Takedown;
  cx: number;
  cy: number;
  onHover: (td: Takedown | null, screenX: number, screenY: number) => void;
  onClick: (td: Takedown) => void;
}

export function TakedownMarker(props: Props) {
  const { takedown, cx, cy, onHover, onClick } = props;
  const [entered, setEntered] = useState(false);
  useLayoutEffect(() => {
    let r2: number | null = null;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      if (r2 !== null) cancelAnimationFrame(r2);
    };
  }, []);

  // Two nested <g> elements: the OUTER one carries the position via the SVG
  // `transform` attribute, the INNER one carries the CSS scale-in animation.
  // CSS `transform: scale(...)` overrides any inline SVG `transform=` on the
  // same element (CSS wins for presentation attributes), so combining both on
  // one node pins every marker to the parent group's origin — i.e. the
  // chart's top-left corner. Splitting them lets CSS animate scale without
  // clobbering the positioning translate.
  return (
    <g transform={`translate(${cx},${cy})`}>
      <g
        className={"timeline__takedown" + (entered ? " timeline__takedown--enter-active" : " timeline__takedown--enter")}
        onMouseEnter={(e) => onHover(takedown, e.clientX, e.clientY)}
        onMouseMove={(e) => onHover(takedown, e.clientX, e.clientY)}
        onMouseLeave={() => onHover(null, 0, 0)}
        onClick={() => onClick(takedown)}
      >
        <circle r={11} fill="rgba(255,181,71,0.18)" stroke="#ffb547" strokeWidth={1.5} />
        <circle className="timeline__takedown-glow" r={4} fill="#ffb547" opacity={0.7} />
        <text textAnchor="middle" dy={4} fontSize={12} fontWeight={800} fill="#ffb547">
          {"⚡"}
        </text>
      </g>
    </g>
  );
}
