import {
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
} from "../shared/timeConstants";

export const WIDTH = 1240;
export const HEIGHT = 690;
export const LEFT = 128;
export const RIGHT = 26;
export const HEART_TOP = 36;
export const HEART_BOTTOM = 150;
export const STEPS_TOP = 162;
export const STEPS_BOTTOM = 192;
export const WORKOUTS_TOP = 206;
export const ACTIVITY_TOP = 252;
export const ACTIVITY_LANE_TOP = 272;
export const ACTIVITY_LANE_HEIGHT = 14;
export const WELLTORY_TOP = 374;
export const WELLTORY_CENTER = 426;
export const EVENT_TOP = 492;
export const TODOIST_TOP = 540;
export const EMA_TOP = 588;
export const EMA_CENTER_Y = 626;
export const AXIS_Y = 640;
export const PRODUCTIVITY_LANES = [
  { level: 2, label: "Фокус" },
  { level: 1, label: "Работа" },
  { level: 0, label: "Нейтр." },
  { level: -1, label: "Личное" },
  { level: -2, label: "Отвлеч." },
];
export const EVENT_COLORS: Record<string, string> = {
  "todo-created": "#29915d",
  "todo-completed": "#4d82d8",
  "todo-deleted": "#c54e4e",
  welltory: "#a75c91",
  metric: "#667f78",
  sleep: "#7779b9",
  workout: "#7b5aa6",
  "ema-answered": "#35876b",
  "ema-pending": "#c39439",
  "ema-dismissed": "#b45c54",
  "ema-expired": "#87948e",
};
export const WORKOUT_COLOR = "#7b5aa6";

export const STEP_BUCKET_DURATION = 15 * MILLISECONDS_PER_MINUTE;
export const HEART_MAX_CONNECTED_GAP = 20 * MILLISECONDS_PER_MINUTE;
export const TIME_TICK_INTERVAL = 4 * MILLISECONDS_PER_HOUR;
export const AXIS_VISIBILITY_THRESHOLD = 0.05;
export const HEART_LOWER_QUANTILE = 0.03;
export const HEART_UPPER_QUANTILE = 0.97;
export const HEART_DEFAULT_MIN = 40;
export const HEART_DEFAULT_MAX = 160;
export const HEART_MIN_RANGE = 10;
export const HEART_RANGE_PADDING = 0.08;

export const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
export const SELECTION_TOOLTIP = {
  maxWidth: 360,
  maxHeight: 240,
  edgePadding: 24,
  pointerOffset: 14,
};
export const HEART_TOOLTIP = {
  width: 112,
  height: 36,
  radius: 8,
  topInset: 3,
  offsetY: 44,
  timeY: 14,
  valueY: 29,
  pointRadius: 5,
};
export const CURSOR_LABEL = {
  width: 52,
  height: 20,
  radius: 4,
  top: 5,
  baseline: 19,
};
export const AXIS_TICK_LABEL_OFFSET = 20;
export const STICKY_AXIS_TOP_PADDING = 10;
export const STICKY_AXIS_HEIGHT = 50;
export const INTERACTIVE_TRACK_SELECTOR = [
  ".chart-step-hit-area",
  ".chart-step-bar",
  ".chart-duration-segment",
  ".chart-event-dot",
  ".chart-sleep-boundary",
  ".welltory-measurement",
  ".todoist-marker",
  ".ema-speedometer",
  ".ema-activity-marker",
].join(", ");

export const TODOIST_MARKER = {
  size: 38,
  minGap: 40,
  offsetY: 7,
  iconSize: 24,
  strokeWidth: 2.25,
  maxBadgeCount: 99,
  mixedColor: "#536b60",
};
export const TODOIST_CLUSTER_WINDOW = 10 * MILLISECONDS_PER_MINUTE;
export const EVENT_MARKER = { topOffset: 34, rows: 2, rowGap: 11, radius: 4.5 };
export const STEP_BAR = {
  minHeight: 1.5,
  topPadding: 2,
  gap: 1,
  minWidth: 1,
  radius: 2,
  color: "#33836b",
};
export const ACTIVITY_BAR = {
  height: 11,
  radius: 2,
  minWidth: 1,
  characterWidth: 5.5,
  labelPadding: 4,
  labelBaseline: 8,
  neutralLane: 2,
};
export const WORKOUT_BAR = { minWidth: 4, height: 18, topOffset: 2, radius: 3 };
export const EMA_ACTIVITY_MARKER = {
  size: 24,
  topOffset: 2,
  iconSize: 15,
  strokeWidth: 2.2,
  color: "#245c4b",
};
export const EMA_GAUGE = {
  hitWidth: 48,
  hitHeight: 28,
  topOffset: 24,
  strokeWidth: 2.5,
  pivotRadius: 2,
  background: "#e2ebe6",
  pivotColor: "#8ea499",
};
export const EMA_GAUGE_TRACKS = [
  { name: "mood", radius: 20, color: "#3b82f6" },
  { name: "energy", radius: 14, color: "#2e9e6b" },
  { name: "stress", radius: 8, color: "#e47b4f" },
] as const;
export const EMA_MAX_RATING = 5;
export const EMA_STATUS_LABELS: Record<string, string> = {
  pending: "ожидание ответа",
  answered: "ответ отправлен",
  dismissed: "отклонено",
  expired: "время ответа истекло",
};
export const WELLTORY_GLYPH = {
  maxHeight: 42,
  barWidth: 12,
  crowdingDistance: 30,
  hitWidth: 20,
  hitPadding: 18,
  energyLabelGap: 5,
  stressLabelGap: 13,
  border: 2,
  fillInsetY: 1,
  radius: 2,
  terminalWidth: 6,
  terminalHeight: 3,
};

export const LANE_LABEL_X = 18;
export const ACTIVITY_LABEL_BASELINE = 9;
export const WELLTORY_SUBLABEL_Y = WELLTORY_TOP + 28;
export const HEART_GRID_ROWS = [
  HEART_TOP,
  (HEART_TOP + HEART_BOTTOM) / 2,
  HEART_BOTTOM,
];
export const LANE_LABELS = [
  { label: "ПУЛЬС", y: (HEART_TOP + HEART_BOTTOM) / 2 },
  { label: "ШАГИ", y: STEPS_TOP + 19 },
  { label: "ТРЕНИРОВКИ", y: WORKOUTS_TOP + 16 },
  { label: "АКТИВНОСТЬ", y: ACTIVITY_TOP + 8 },
  { label: "WELLTORY", y: WELLTORY_TOP + 13 },
  { label: "СОБЫТИЯ", y: EVENT_TOP + 17 },
  { label: "TODOIST", y: TODOIST_TOP + 17 },
  { label: "EMA", y: EMA_TOP + 17 },
];
