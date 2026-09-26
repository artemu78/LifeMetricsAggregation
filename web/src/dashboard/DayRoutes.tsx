import { X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { shiftIsoDate } from "../dashboardWindow";
import { dashboardStore as store } from "../store";
import { DayTimelineChart } from "../timeline/DayTimelineChart";
import { DayModal } from "./DayModal";

const TIMELINE_DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export const TimelineRoute = observer(function TimelineRoute() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const day = store.dashboard?.days.find((item) => item.date === date);
  const nextDate = day ? shiftIsoDate(day.date, 1) : undefined;
  const nextDay = store.dashboard?.days.find((item) => item.date === nextDate);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeTimeline = () => navigate(`/day/${day?.date ?? date}`);
  const isDialogRendered = Boolean(store.dashboard && day);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [isDialogRendered]);
  if (!store.dashboard) return null;
  if (!day) return <Navigate to="/" replace />;
  return (
    <dialog
      ref={dialogRef}
      className="modal-backdrop timeline-backdrop"
      aria-labelledby="timeline-title"
      onCancel={(event) => {
        event.preventDefault();
        closeTimeline();
      }}
    >
      <button
        type="button"
        className="timeline-backdrop-dismiss"
        aria-label="Закрыть Ход дня"
        onClick={closeTimeline}
      />
      <section className="modal timeline-modal">
        <header>
          <div>
            <p className="eyebrow">
              Хронология дня · {store.dashboard.timezone}
            </p>
            <h2 id="timeline-title" className="timeline-title">
              Ход дня{" "}
              <time>
                {TIMELINE_DATE_FORMAT.format(new Date(`${day.date}T12:00:00Z`))}
              </time>
            </h2>
            <p className="muted">
              Все сохранённые измерения и события в порядке времени
            </p>
          </div>
          <button
            className="icon-button"
            onClick={closeTimeline}
            aria-label="Закрыть"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <DayTimelineChart
          day={day}
          timezone={store.dashboard.timezone}
          nextDaySleepMetrics={nextDay?.detail.braceletMetrics}
        />
      </section>
    </dialog>
  );
});

export const DayRoute = observer(function DayRoute() {
  const { date } = useParams<{ date: string }>();
  const day = store.dashboard?.days.find((item) => item.date === date);

  if (!store.dashboard) return null;
  if (!day) return <Navigate to="/" replace />;

  return <DayModal day={day} timezone={store.dashboard.timezone} />;
});
