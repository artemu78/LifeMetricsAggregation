import type { components } from "../generated/api-types";
import { MILLISECONDS_PER_SECOND } from "../shared/timeConstants";

type Metric =
  components["schemas"]["DashboardDay"]["detail"]["braceletMetrics"][number];

export interface SleepStagesChartProps {
  readonly sleepMetrics: readonly Metric[];
  readonly timezone: string;
}

export type SleepPhaseKey = "deep" | "light" | "rem" | "awake";

export interface SleepPhaseConfig {
  readonly key: SleepPhaseKey;
  readonly label: string;
  readonly name: string;
  readonly level: number;
  readonly color: string;
}

export const SLEEP_PHASE_CONFIGS: Record<SleepPhaseKey, SleepPhaseConfig> = {
  awake: {
    key: "awake",
    label: "awake",
    name: "Пробуждение",
    level: 3,
    color: "#e07a5f",
  },
  rem: {
    key: "rem",
    label: "rem",
    name: "Быстрый сон",
    level: 2,
    color: "#8f78b5",
  },
  light: {
    key: "light",
    label: "light",
    name: "Лёгкий сон",
    level: 1,
    color: "#5c95c4",
  },
  deep: {
    key: "deep",
    label: "deep",
    name: "Глубокий сон",
    level: 0,
    color: "#2c467a",
  },
};

export const SLEEP_PHASES: readonly SleepPhaseConfig[] = [
  SLEEP_PHASE_CONFIGS.awake,
  SLEEP_PHASE_CONFIGS.rem,
  SLEEP_PHASE_CONFIGS.light,
  SLEEP_PHASE_CONFIGS.deep,
] as const;

export function normalizeSleepPhase(metric: string): SleepPhaseKey {
  const clean = metric
    .replaceAll("fitness_drive.sleep.", "")
    .replaceAll("_seconds", "")
    .toLowerCase();

  if (clean.includes("deep")) return "deep";
  if (clean.includes("rem")) return "rem";
  if (clean.includes("awake") || clean.includes("out_of_bed")) return "awake";
  return "light";
}

export interface SleepInterval {
  start: number;
  end: number;
  phase: SleepPhaseKey;
  durationSec: number;
}

const DEFAULT_STAGE_DURATION_SEC = 900;

function resolveOverlappingIntervals(
  intervals: SleepInterval[],
): SleepInterval[] {
  for (let i = 0; i < intervals.length - 1; i++) {
    const curr = intervals[i];
    const next = intervals[i + 1];
    if (curr.end > next.start) {
      curr.end = next.start;
      curr.durationSec = Math.max(
        0,
        Math.round((curr.end - curr.start) / MILLISECONDS_PER_SECOND),
      );
    }
  }
  return intervals;
}

export function extractSleepIntervals(
  metrics: readonly Metric[],
): SleepInterval[] {
  const sleepPoints = metrics
    .filter((p) => p.metric.startsWith("fitness_drive.sleep."))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (!sleepPoints.length) return [];

  const intervals: SleepInterval[] = [];

  for (const p of sleepPoints) {
    const start = Date.parse(p.timestamp);
    if (Number.isNaN(start)) continue;

    const phase = normalizeSleepPhase(p.metric);
    const durationSec =
      p.value != null && p.value > 0 ? p.value : DEFAULT_STAGE_DURATION_SEC;
    const end = start + durationSec * MILLISECONDS_PER_SECOND;
    intervals.push({ start, end, phase, durationSec });
  }

  return resolveOverlappingIntervals(intervals);
}
