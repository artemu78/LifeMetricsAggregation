import { RecordTime } from "../shared/RecordTime";
import type { DashboardDay } from "../store";

export function TodoistPanel({
  day,
  timezone,
}: {
  day: DashboardDay;
  timezone: string;
}) {
  return (
    <section className="panel">
      <h3>Todoist</h3>
      <TaskRecords
        title="Созданные"
        tasks={day.detail.createdTasks}
        timezone={timezone}
      />
      <TaskRecords
        title="Завершённые"
        tasks={day.detail.completedTasks}
        timezone={timezone}
      />
      {!day.detail.createdTasks.length && !day.detail.completedTasks.length && (
        <p className="muted">Нет задач</p>
      )}
    </section>
  );
}

function TaskRecords({
  title,
  tasks,
  timezone,
}: {
  title: string;
  tasks: DashboardDay["detail"]["createdTasks"];
  timezone: string;
}) {
  return (
    <>
      <h4>{title}</h4>
      <ul className="record-list">
        {tasks.map((task) => (
          <li key={`${task.timestamp}-${task.content}`}>
            <RecordTime timestamp={task.timestamp} timezone={timezone} />
            <span>{task.content}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
