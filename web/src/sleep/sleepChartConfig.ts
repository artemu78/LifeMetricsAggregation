import type { SleepPhaseKey } from "./sleepModel";

export const WIDTH = 800;
export const HEIGHT = 180;
export const LEFT = 72;
export const RIGHT = 24;
export const TOP = 22;
export const BOTTOM = 148;
export const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
export const PLOT_HEIGHT = BOTTOM - TOP;
export const STEP_Y = PLOT_HEIGHT / 3;

export const Y_LEVELS: Record<SleepPhaseKey, number> = {
  awake: TOP,
  rem: TOP + STEP_Y,
  light: TOP + 2 * STEP_Y,
  deep: BOTTOM,
};

export const SLEEP_TICK_COUNT = 5;
export const SLEEP_GAP_MINUTES = 15;
export const GAP_TRANSITION = { maxWidth: 16, intervalFraction: 0.3 };
export const STAGE_TRANSITION = {
  maxWidth: 14,
  minWidth: 3,
  intervalFraction: 0.25,
};
export const SLEEP_TOOLTIP = {
  width: 170,
  height: 44,
  topInset: 4,
  offset: 10,
  radius: 6,
  titleY: 18,
  detailY: 34,
};

export const SLEEP_LINE_WIDTH = 3.5;
export const PHASE_AXIS = {
  dotOffset: 46,
  dotRadius: 3,
  labelOffset: 8,
  baseline: 4,
  fontSize: 12,
  fontWeight: 600,
  gridColor: "#e4ece8",
  dash: "4 4",
};
export const SLEEP_TIME_AXIS = {
  tickLength: 5,
  baseline: 18,
  color: "#b5c7bf",
};
export const SLEEP_GRADIENT_STOPS = [
  { offset: "0%", color: "#2c467a", opacity: 0.06 },
  { offset: "33.3%", color: "#5c95c4", opacity: 0.14 },
  { offset: "66.7%", color: "#8f78b5", opacity: 0.2 },
  { offset: "100%", color: "#e07a5f", opacity: 0.26 },
];
export const SLEEP_HOVER = {
  lineColor: "#7c9288",
  dash: "3 3",
  lineWidth: 1.2,
  pointRadius: 5.5,
  pointBorder: 2,
  background: "rgba(255, 255, 255, 0.96)",
  border: "#c6d5cd",
  shadow: "drop-shadow(0 2px 6px rgba(0,0,0,0.12))",
  titleSize: 11,
  titleWeight: 700,
  detailSize: 10.5,
  detailColor: "#49655b",
};
