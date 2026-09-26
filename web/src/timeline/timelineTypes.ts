import type { components } from "../generated/api-types";

export type Day = components["schemas"]["DashboardDay"];
export type RecordItem = {
  start: number;
  end: number;
  label: string;
  detail: string;
  color: string;
  kind: string;
};
export type EmaRecordItem = RecordItem & {
  mood?: number;
  energy?: number;
  stress?: number;
  focus?: number;
  activity?: string;
  note?: string;
};
export type TodoistCluster = {
  timestamp: number;
  events: RecordItem[];
  color: string;
};
export type Metric = Day["detail"]["braceletMetrics"][number];
export type RescueItem = Day["detail"]["rescueTime"][number];
