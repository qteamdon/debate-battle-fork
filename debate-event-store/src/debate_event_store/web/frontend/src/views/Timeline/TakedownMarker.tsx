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

  return (
    <g
      className={"timeline__takedown" + (entered ? " timeline__takedown--enter-active" : " timeline__takedown--enter")}
      transform={`translate(${cx},${cy})`}
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
  );
}
