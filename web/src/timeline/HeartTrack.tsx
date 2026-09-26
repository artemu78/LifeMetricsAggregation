import { useId, useMemo, useState, type MouseEvent } from "react";
import {
  HEART_BOTTOM,
  HEART_DEFAULT_MAX,
  HEART_DEFAULT_MIN,
  HEART_LOWER_QUANTILE,
  HEART_MAX_CONNECTED_GAP,
  HEART_MIN_RANGE,
  HEART_RANGE_PADDING,
  HEART_TOOLTIP,
  HEART_TOP,
  HEART_UPPER_QUANTILE,
  LEFT,
  PLOT_WIDTH as plotWidth,
  RIGHT,
  WIDTH,
} from "./timelineConfig";
import { localLabel, sortCopy } from "./timelineModel";

type HeartPoint = { time: number; value: number };
type Props = {
  heart: HeartPoint[];
  x: (time: number) => number;
  timezone: string;
};

function buildHeartGeometry(heart: HeartPoint[], x: Props["x"]) {
  const heartValueList = heart.map((item) => item.value);
  const heartValues = sortCopy(heartValueList, (a, b) => a - b);
  const low = heartValues.length
    ? heartValues[Math.floor((heartValues.length - 1) * HEART_LOWER_QUANTILE)]
    : HEART_DEFAULT_MIN;
  const high = heartValues.length
    ? heartValues[Math.ceil((heartValues.length - 1) * HEART_UPPER_QUANTILE)]
    : HEART_DEFAULT_MAX;
  const heartRange = Math.max(HEART_MIN_RANGE, high - low);
  const heartY = (value: number) =>
    HEART_BOTTOM -
    ((value - (low - heartRange * HEART_RANGE_PADDING)) /
      (heartRange * (1 + 2 * HEART_RANGE_PADDING))) *
      (HEART_BOTTOM - HEART_TOP);
  const heartPathPoints = heart.map((point, index) => {
    const previous = heart[index - 1];
    const command =
      previous && point.time - previous.time <= HEART_MAX_CONNECTED_GAP
        ? "L"
        : "M";
    return `${command}${x(point.time).toFixed(1)},${heartY(point.value).toFixed(1)}`;
  });
  const heartPath = heartPathPoints.join(" ");
  return { heartY, heartPath };
}

export function HeartTrack({ heart, x, timezone }: Readonly<Props>) {
  const clipId = useId();
  const [hoveredHeart, setHoveredHeart] = useState<HeartPoint | null>(null);
  const { heartY, heartPath } = useMemo(
    () => buildHeartGeometry(heart, x),
    [heart, x],
  );
  const hoverHeartAt = (event: MouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!bounds || !heart.length) return;
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const nearest = heart.reduce(
      (best, candidate) =>
        Math.abs(x(candidate.time) - pointerX) <
        Math.abs(x(best.time) - pointerX)
          ? candidate
          : best,
      heart[0]!,
    );
    setHoveredHeart(nearest);
  };
  const hoverX = hoveredHeart ? x(hoveredHeart.time) : 0;
  const hoverY = hoveredHeart ? heartY(hoveredHeart.value) : 0;
  const hoverBoxX = Math.max(
    LEFT,
    Math.min(
      WIDTH - RIGHT - HEART_TOOLTIP.width,
      hoverX - HEART_TOOLTIP.width / 2,
    ),
  );
  const hoverBoxY = Math.max(
    HEART_TOP + HEART_TOOLTIP.topInset,
    hoverY - HEART_TOOLTIP.offsetY,
  );

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect
            x={LEFT}
            y={HEART_TOP}
            width={plotWidth}
            height={HEART_BOTTOM - HEART_TOP}
          />
        </clipPath>
      </defs>
      <g className="heart-rate-series">
        <g clipPath={`url(#${clipId})`}>
          <path d={heartPath} className="heart-rate-path" />
        </g>
        {heart.length > 0 && (
          <rect
            x={LEFT}
            y={HEART_TOP}
            width={plotWidth}
            height={HEART_BOTTOM - HEART_TOP}
            className="heart-rate-hit-area"
            onMouseMove={hoverHeartAt}
            onMouseLeave={() => setHoveredHeart(null)}
            aria-label="Наведение на дорожку показывает ближайшее время и пульс"
          />
        )}
        {hoveredHeart && (
          <g className="heart-hover-popup" pointerEvents="none">
            <line x1={hoverX} x2={hoverX} y1={HEART_TOP} y2={HEART_BOTTOM} />
            <circle cx={hoverX} cy={hoverY} r={HEART_TOOLTIP.pointRadius} />
            <rect
              x={hoverBoxX}
              y={hoverBoxY}
              width={HEART_TOOLTIP.width}
              height={HEART_TOOLTIP.height}
              rx={HEART_TOOLTIP.radius}
            />
            <text
              x={hoverBoxX + HEART_TOOLTIP.width / 2}
              y={hoverBoxY + HEART_TOOLTIP.timeY}
              textAnchor="middle"
            >
              {localLabel(hoveredHeart.time, timezone)}
            </text>
            <text
              x={hoverBoxX + HEART_TOOLTIP.width / 2}
              y={hoverBoxY + HEART_TOOLTIP.valueY}
              textAnchor="middle"
              className="heart-hover-value"
            >
              {Math.round(hoveredHeart.value)} уд/мин
            </text>
          </g>
        )}
      </g>
    </>
  );
}
