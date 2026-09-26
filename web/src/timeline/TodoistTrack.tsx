import { ListTodo } from "lucide-react";
import type { MouseEvent } from "react";
import { TODOIST_MARKER, TODOIST_TOP } from "./timelineConfig";
import { localLabel } from "./timelineModel";
import type { RecordItem, TodoistCluster } from "./timelineTypes";

type Props = {
  todoistClusters: TodoistCluster[];
  todoistIconPositions: number[];
  timezone: string;
  selectAtCursor: (item: RecordItem, event: MouseEvent<Element>) => void;
};

export function TodoistTrack({
  todoistClusters,
  todoistIconPositions,
  timezone,
  selectAtCursor,
}: Props) {
  const todoistClusterItem = (cluster: TodoistCluster): RecordItem => ({
    start: cluster.events[0].start,
    end: cluster.events.at(-1)!.start,
    label: "Todoist",
    detail: cluster.events
      .map((item) => `${localLabel(item.start, timezone)} · ${item.detail}`)
      .join("\n"),
    color: cluster.color,
    kind: "todoist-cluster",
  });

  return (
    <>
      {todoistClusters.map((cluster, index) => {
        const description = cluster.events
          .map((item) => `${localLabel(item.start, timezone)} · ${item.detail}`)
          .join("\n");
        const badge =
          cluster.events.length > TODOIST_MARKER.maxBadgeCount
            ? `${TODOIST_MARKER.maxBadgeCount}+`
            : String(cluster.events.length);
        return (
          <foreignObject
            key={`todoist-cluster-${cluster.timestamp}`}
            x={todoistIconPositions[index] - TODOIST_MARKER.size / 2}
            y={TODOIST_TOP - TODOIST_MARKER.offsetY}
            width={TODOIST_MARKER.size}
            height={TODOIST_MARKER.size}
          >
            <button
              type="button"
              className="todoist-marker"
              aria-label={description}
              onClick={(event) =>
                selectAtCursor(todoistClusterItem(cluster), event)
              }
              onMouseEnter={(event) =>
                selectAtCursor(todoistClusterItem(cluster), event)
              }
              onMouseMove={(event) =>
                selectAtCursor(todoistClusterItem(cluster), event)
              }
            >
              <ListTodo
                size={TODOIST_MARKER.iconSize}
                color={cluster.color}
                strokeWidth={TODOIST_MARKER.strokeWidth}
                aria-hidden="true"
              />
              {cluster.events.length > 1 && (
                <span
                  className="todoist-count-badge"
                  style={{ backgroundColor: cluster.color }}
                >
                  {badge}
                </span>
              )}
            </button>
          </foreignObject>
        );
      })}
    </>
  );
}
