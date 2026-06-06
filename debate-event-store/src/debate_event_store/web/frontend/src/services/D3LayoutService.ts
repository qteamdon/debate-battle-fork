import { injectable } from "tsyringe";
import { line, curveCatmullRom, scaleLinear, type ScaleLinear } from "d3";

export const TOKEN_D3LayoutService = Symbol("D3LayoutService");

export interface XY {
  x: number;
  y: number;
}

@injectable()
export class D3LayoutService {
  computeTimeScale(
    domainStart: number,
    domainEnd: number,
    rangeStart: number,
    rangeEnd: number,
  ): ScaleLinear<number, number> {
    const safeEnd = domainEnd > domainStart ? domainEnd : domainStart + 1;
    return scaleLinear().domain([domainStart, safeEnd]).range([rangeStart, rangeEnd]);
  }

  computeMomentumScale(
    seriesValues: readonly number[],
    top: number,
    bottom: number,
  ): ScaleLinear<number, number> {
    const max = Math.max(1, ...seriesValues.map((v) => Math.abs(v)));
    return scaleLinear().domain([-max, max]).range([bottom, top]);
  }

  pathFor(points: readonly XY[]): string {
    if (points.length === 0) return "";
    const generator = line<XY>()
      .x((p) => p.x)
      .y((p) => p.y)
      .curve(curveCatmullRom.alpha(0.5));
    return generator(points as XY[]) ?? "";
  }
}
