import type { DashboardDay } from "../store";
import { CalendarCell } from "./CalendarCell";
import { MONTH_FORMAT, WEEKDAYS } from "./dashboardConfig";

const ISO_MONTH_LENGTH = "YYYY-MM".length;

function monthLabel(date: string) {
  const label = MONTH_FORMAT.format(
    new Date(`${date.slice(0, ISO_MONTH_LENGTH)}-01T12:00:00Z`),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function DashboardCalendar({ days }: Readonly<{ days: DashboardDay[] }>) {
  const monthGroups = days.reduce<
    Array<{
      key: string;
      days: DashboardDay[];
    }>
  >((groups, day) => {
    const key = day.date.slice(0, ISO_MONTH_LENGTH);
    const current = groups.at(-1);
    if (current?.key === key) current.days.push(day);
    else groups.push({ key, days: [day] });
    return groups;
  }, []);
  return (
    <div className="calendar-months" aria-label="Календарь данных">
      {monthGroups.map((month) => (
        <section
          className="month-section"
          key={month.key}
          aria-labelledby={`month-${month.key}`}
        >
          <div className="month-header">
            <h2 className="month-title" id={`month-${month.key}`}>
              {monthLabel(month.days[0].date)}
            </h2>
            <div className="calendar">
              {WEEKDAYS.map((day) => (
                <div className="weekday" key={day}>
                  {day}
                </div>
              ))}
            </div>
          </div>
          <div className="calendar">
            {Array.from({ length: month.days[0].weekday - 1 }).map((_, i) => (
              <div className="empty" key={`empty-${month.key}-${i}`} />
            ))}
            {month.days.map((day) => (
              <CalendarCell day={day} key={day.date} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
