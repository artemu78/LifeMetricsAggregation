export const ACTIVITY_COLORS = [
  "#68a9c9",
  "#4c7f6d",
  "#d7a742",
  "#8f78b5",
  "#cf7c5c",
  "#789087",
];
export const PRODUCTIVITY_COLORS: Record<string, string> = {
  "-2": "#cf5c4f",
  "-1": "#db8b51",
  "0": "#a7b3ae",
  "1": "#75b7d5",
  "2": "#4d82d8",
};

export const DETAIL_CHART_HEIGHT = 220;
export const METRIC_TICK_GAP = 28;
export const METRIC_AXIS_WIDTH = 42;
export const METRIC_LINE_WIDTH = 2;
export const PRODUCTIVITY_INNER_RADIUS = 68;
export const PRODUCTIVITY_OUTER_RADIUS = 96;
export const ACTIVITY_RANK_LIMIT = 6;
export const FALLBACK_ACTIVITY_COLOR = "#789087";

export const PERCENT_MAX = 100;
export const PRODUCTIVITY_MIDPOINT = PERCENT_MAX / 2;
export const PRODUCTIVITY_MIN_WEIGHT = -2;
export const PRODUCTIVITY_MAX_WEIGHT = 2;

export const METRIC_GRID = { color: "#dce6e1", dash: "3 3" };
export const OXYGEN_CHART = {
  metric: "fitness_drive.oxygen_saturation",
  color: "#3388a4",
  title: "Кислород",
};
export const PRODUCTIVITY_MARKER_GRADIENT = {
  centerPercent: 20,
  edgePercent: 90,
};
