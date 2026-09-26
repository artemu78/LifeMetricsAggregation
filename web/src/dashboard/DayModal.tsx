import { OXYGEN_CHART } from "../shared/chartConfig";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRef } from "react";
import { useNavigate } from "react-router";
import { shiftIsoDate } from "../dashboardWindow";
import { useModalDismissAndTrapFocus } from "../shared/useModalDismissAndTrapFocus";
import {
  dashboardStore as store,
  type DashboardDay,
  type DashboardResponse,
} from "../store";
import { DayTimelineChart } from "../timeline/DayTimelineChart";
import { BraceletPanel } from "./BraceletPanel";
import { MetricChart } from "./MetricChart";
import { RescueTimePanel } from "./RescueTimePanel";
import { TodoistPanel } from "./TodoistPanel";
import { WelltoryPanel } from "./WelltoryPanel";

export function DayModal({
  day,
  timezone,
}: Readonly<{
  day: DashboardDay;
  timezone: DashboardResponse["timezone"];
}>) {
  const modalRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const days = store.dashboard?.days ?? [];
  const selectedIndex = days.findIndex((item) => item.date === day.date);
  const previousDate = selectedIndex > 0 ? days[selectedIndex - 1].date : null;
  const nextDate =
    selectedIndex >= 0 && selectedIndex < days.length - 1
      ? days[selectedIndex + 1].date
      : null;
  const close = () => navigate("/", { replace: true });
  const selectDate = (date: string) => navigate(`/day/${date}`);

  useModalDismissAndTrapFocus(modalRef, close, (event) => {
    if (event.key === "ArrowLeft" && previousDate) {
      selectDate(previousDate);
    } else if (event.key === "ArrowRight" && nextDate) {
      selectDate(nextDate);
    }
  });
  const nextCalendarDate = shiftIsoDate(day.date, 1);
  const nextDay = store.dashboard?.days.find(
    (item) => item.date === nextCalendarDate,
  );
  return (
    <div className="modal-backdrop">
      <dialog
        ref={modalRef}
        className="modal day-detail-modal"
        open
        aria-labelledby="day-title"
        tabIndex={-1}
      >
        <header>
          <div className="day-heading">
            <p className="eyebrow">Подробности дня</p>
            <h2 id="day-title">{day.date}</h2>
            <nav className="day-navigation" aria-label="Навигация по датам">
              <button
                className="date-navigation-button"
                onClick={() => previousDate && selectDate(previousDate)}
                disabled={!previousDate}
              >
                <ChevronLeft aria-hidden="true" /> Предыдущая дата
              </button>
              <button
                className="date-navigation-button"
                onClick={() => nextDate && selectDate(nextDate)}
                disabled={!nextDate}
              >
                Следующая дата <ChevronRight aria-hidden="true" />
              </button>
            </nav>
          </div>
          <button className="icon-button" onClick={close} aria-label="Закрыть">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="source-statuses">
          {day.sources.map((source) => (
            <span key={source.source} className={`source-${source.status}`}>
              {source.source}: {source.status}
            </span>
          ))}
        </div>

        <DayTimelineChart
          day={day}
          timezone={timezone}
          nextDaySleepMetrics={nextDay?.detail?.braceletMetrics}
        />

        <div className="detail-grid">
          <BraceletPanel day={day} timezone={timezone} />

          <WelltoryPanel day={day} timezone={timezone} />
        </div>

        <div className="charts">
          <MetricChart day={day} {...OXYGEN_CHART} timezone={timezone} />
        </div>

        <div className="activity-detail-grid">
          <TodoistPanel day={day} timezone={timezone} />

          <RescueTimePanel day={day} timezone={timezone} />
        </div>
      </dialog>
    </div>
  );
}
