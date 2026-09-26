import { METRIC_GRID } from "../shared/chartConfig";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DETAIL_CHART_HEIGHT,
  METRIC_AXIS_WIDTH,
  METRIC_LINE_WIDTH,
  METRIC_TICK_GAP,
} from "../shared/chartConfig";
import type { DashboardDay, DashboardResponse } from "../store";

export function MetricChart({
  day,
  metric,
  color,
  title,
  timezone,
}: {
  day: DashboardDay;
  metric: string;
  color: string;
  title: string;
  timezone: DashboardResponse["timezone"];
}) {
  const data = day.detail.braceletMetrics
    .filter((point) => point.metric === metric && point.value != null)
    .map((point) => ({
      time: new Date(point.timestamp).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
      }),
      value: point.value!,
    }));
  if (!data.length) return null;
  return (
    <section className="chart-card">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={DETAIL_CHART_HEIGHT}>
        <LineChart data={data}>
          <CartesianGrid
            strokeDasharray={METRIC_GRID.dash}
            stroke={METRIC_GRID.color}
          />
          <XAxis dataKey="time" minTickGap={METRIC_TICK_GAP} />
          <YAxis domain={["auto", "auto"]} width={METRIC_AXIS_WIDTH} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            dot={false}
            strokeWidth={METRIC_LINE_WIDTH}
          />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
