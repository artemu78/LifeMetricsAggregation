import { useEffect, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import {
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Footprints,
  HeartPulse,
  ListPlus,
  ListTodo,
  Moon,
  RefreshCw,
  Watch,
  X,
} from 'lucide-react'
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useMatch,
  useNavigate,
  useParams,
} from 'react-router'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { dashboardStore as store, type DashboardDay, type DashboardResponse } from './store'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTH_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const QUALITY: Record<string, string> = {
  complete: 'Все источники обновлены',
  partial: 'Есть частичные или исторические данные без подтверждённого запуска',
  failed: 'Один или несколько источников завершились ошибкой',
  not_run: 'Сбор данных не запускался',
  in_progress: 'Текущий логический день ещё продолжается',
}

function hours(seconds: number | null) {
  return seconds == null ? '—' : `${(seconds / 3600).toFixed(1)} ч`
}

function monthLabel(date: string) {
  const label = MONTH_FORMAT.format(new Date(`${date.slice(0, 7)}-01T12:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function CalendarCell({ day }: { day: DashboardDay }) {
  const date = new Date(`${day.date}T12:00:00Z`)
  const sourceAvailable = (source: string) => {
    const status = day.sources.find((item) => item.source === source)?.status
    return status === 'success' || status === 'partial'
  }
  return (
    <Link
      className={`day-card quality-${day.quality}`}
      to={`/day/${day.date}`}
      aria-label={`${day.date}. ${QUALITY[day.quality]}`}
    >
      <div className="date-row">
        <strong>{date.getUTCDate()}</strong>
        <span>{WEEKDAYS[day.weekday - 1]}</span>
      </div>
      <div className="numbers">
        <div><span><Moon aria-hidden="true" />Сон</span><b>{hours(day.bracelet.sleepSeconds)}</b></div>
        <div><span><Footprints aria-hidden="true" />Шаги</span><b>{day.bracelet.steps?.toLocaleString('ru-RU') ?? '—'}</b></div>
        <div><span><ListPlus aria-hidden="true" />Создано</span><b>{day.todoist.created}</b></div>
        <div><span><CheckCircle2 aria-hidden="true" />Закрыто</span><b>{day.todoist.completed}</b></div>
      </div>
      <div className="indicators" aria-label="Источники">
        <span className={sourceAvailable('bracelet') ? 'on' : ''} title="Браслет" aria-label={`Браслет: ${sourceAvailable('bracelet') ? 'данные доступны' : 'нет данных'}`}><Watch aria-hidden="true" /></span>
        <span className={sourceAvailable('welltory') ? 'on' : ''} title="Welltory" aria-label={`Welltory: ${sourceAvailable('welltory') ? 'данные доступны' : 'нет данных'}`}><HeartPulse aria-hidden="true" /></span>
        <span className={sourceAvailable('todoist') ? 'on' : ''} title="Todoist" aria-label={`Todoist: ${sourceAvailable('todoist') ? 'данные доступны' : 'нет данных'}`}><ListTodo aria-hidden="true" /></span>
        <span className={sourceAvailable('rescuetime') ? 'on' : ''} title="RescueTime" aria-label={`RescueTime: ${sourceAvailable('rescuetime') ? 'данные доступны' : 'нет данных'}`}><ChartNoAxesCombined aria-hidden="true" /></span>
      </div>
    </Link>
  )
}

function MetricChart({ day, metric, color, title, timezone }: {
  day: DashboardDay
  metric: string
  color: string
  title: string
  timezone: DashboardResponse['timezone']
}) {
  const data = day.detail.braceletMetrics
    .filter((point) => point.metric === metric)
    .map((point) => ({
      time: new Date(point.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      }),
      value: point.value,
    }))
  if (!data.length) return null
  return (
    <section className="chart-card">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dce6e1" />
          <XAxis dataKey="time" minTickGap={28} />
          <YAxis domain={['auto', 'auto']} width={42} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  )
}

function DayModal({ day, timezone }: {
  day: DashboardDay
  timezone: DashboardResponse['timezone']
}) {
  const modalRef = useRef<HTMLElement>(null)
  const navigate = useNavigate()
  const days = store.dashboard?.days ?? []
  const selectedIndex = days.findIndex((item) => item.date === day.date)
  const previousDate = selectedIndex > 0 ? days[selectedIndex - 1].date : null
  const nextDate = selectedIndex >= 0 && selectedIndex < days.length - 1
    ? days[selectedIndex + 1].date
    : null
  const close = () => navigate('/', { replace: true })
  const selectDate = (date: string) => navigate(`/day/${date}`)
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modalRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
        return
      }
      if (event.key === 'ArrowLeft' && previousDate) {
        selectDate(previousDate)
        return
      }
      if (event.key === 'ArrowRight' && nextDate) {
        selectDate(nextDate)
        return
      }
      if (event.key !== 'Tab' || !modalRef.current) return
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (!active || !focusable.includes(active)) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
    }
  }, [navigate, previousDate, nextDate])
  const sleep = day.detail.braceletMetrics.filter((point) => point.metric.startsWith('fitness_drive.sleep.'))
  const rescueActivity = day.detail.rescueTime.filter((item) => item.perspective === 'activity')
  const rescueProductivity = day.detail.rescueTime.filter((item) => item.perspective === 'productivity')
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <article
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
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
          <button className="icon-button" onClick={close} aria-label="Закрыть"><X aria-hidden="true" /></button>
        </header>

        <div className="source-statuses">
          {day.sources.map((source) => (
            <span key={source.source} className={`source-${source.status}`}>
              {source.source}: {source.status}
            </span>
          ))}
        </div>

        <div className="detail-grid">
          <section className="panel">
            <h3>Браслет</h3>
            <div className="metric-list">
              <p><span>Сон</span><b>{hours(day.bracelet.sleepSeconds)}</b></p>
              <p><span>Шаги</span><b>{day.bracelet.steps?.toLocaleString('ru-RU') ?? '—'}</b></p>
            </div>
            <div className="sleep-stages">
              {sleep.map((point, index) => (
                <div key={index}>
                  <span>{point.metric.replace('fitness_drive.sleep.', '').replace('_seconds', '')}</span>
                  <b>{hours(point.value)}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h3>Welltory</h3>
            <div className="measurement-grid">
              {day.detail.welltoryMetrics.map((point, index) => (
                <div key={index}>
                  <span>{point.metric.replace('welltory.', '')}</span>
                  <b>{point.value.toFixed(1)} {point.unit ?? ''}</b>
                </div>
              ))}
              {!day.detail.welltoryMetrics.length && <p className="muted">Нет измерений</p>}
            </div>
          </section>
        </div>

        <div className="charts">
          <MetricChart day={day} metric="fitness_drive.heart_rate" color="#cf5c4f" title="Пульс" timezone={timezone} />
          <MetricChart day={day} metric="fitness_drive.oxygen_saturation" color="#3388a4" title="Кислород" timezone={timezone} />
        </div>

        <div className="detail-grid">
          <section className="panel">
            <h3>Todoist</h3>
            <h4>Созданные</h4>
            <ul>{day.detail.createdTasks.map((task, i) => <li key={i}>{task.content}</li>)}</ul>
            <h4>Завершённые</h4>
            <ul>{day.detail.completedTasks.map((task, i) => <li key={i}>{task.content}</li>)}</ul>
            {!day.detail.createdTasks.length && !day.detail.completedTasks.length && <p className="muted">Нет задач</p>}
          </section>

          <section className="panel">
            <h3>RescueTime</h3>
            <h4>Активность</h4>
            <ul>{rescueActivity.map((item, i) => <li key={i}>{item.label}: {hours(item.seconds)}</li>)}</ul>
            <h4>Продуктивность</h4>
            <ul>{rescueProductivity.map((item, i) => <li key={i}>{item.label}: {hours(item.seconds)}</li>)}</ul>
            <p className="note">Активность и продуктивность — разные классификации одного времени и не складываются.</p>
          </section>
        </div>
      </article>
    </div>
  )
}

const DayRoute = observer(function DayRoute() {
  const { date } = useParams<{ date: string }>()
  const day = store.dashboard?.days.find((item) => item.date === date)

  if (!store.dashboard) return null
  if (!day) return <Navigate to="/" replace />

  return <DayModal day={day} timezone={store.dashboard.timezone} />
})

const Dashboard = observer(function Dashboard() {
  const dayMatch = useMatch('/day/:date')
  useEffect(() => {
    void store.load()
  }, [])
  const monthGroups = (store.dashboard?.days ?? []).reduce<Array<{
    key: string
    days: DashboardDay[]
  }>>((groups, day) => {
    const key = day.date.slice(0, 7)
    const current = groups[groups.length - 1]
    if (current?.key === key) current.days.push(day)
    else groups.push({ key, days: [day] })
    return groups
  }, [])
  return (
    <main className={dayMatch ? 'app blurred' : 'app'}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Локальный обзор</p>
          <h1>Live Life</h1>
          <p className="subtitle">30 дней · {store.from} — {store.to}</p>
        </div>
        <div className="actions">
          <button className="sync-button" onClick={() => void store.syncBracelet()} disabled={store.syncing}>
            <RefreshCw className={store.syncing ? 'spinning' : undefined} aria-hidden="true" />
            {store.syncing ? 'Обновляем…' : 'Обновить браслет'}
          </button>
          <button className="help-button" onClick={() => store.toggleHelp()} aria-label="Легенда качества"><CircleHelp aria-hidden="true" /></button>
          {store.helpOpen && (
            <div className="legend">
              {Object.entries(QUALITY).map(([key, label]) => (
                <p key={key}><i className={`legend-dot quality-${key}`} />{label}</p>
              ))}
            </div>
          )}
        </div>
      </header>

      {store.error && <div className="message error">{store.error}</div>}
      {store.syncMessage && <div className="message success">{store.syncMessage}</div>}
      {store.loading && !store.dashboard && <div className="loading">Загружаем календарь…</div>}

      <div className="calendar-months" aria-label="Календарь данных">
        {monthGroups.map((month) => (
          <section className="month-section" key={month.key} aria-labelledby={`month-${month.key}`}>
            <h2 className="month-title" id={`month-${month.key}`}>{monthLabel(month.days[0].date)}</h2>
            <div className="calendar">
              {WEEKDAYS.map((day) => <div className="weekday" key={day}>{day}</div>)}
              {Array.from({ length: month.days[0].weekday - 1 }).map((_, i) => (
                <div className="empty" key={`empty-${month.key}-${i}`} />
              ))}
              {month.days.map((day) => <CalendarCell day={day} key={day.date} />)}
            </div>
          </section>
        ))}
      </div>

      <Outlet />
    </main>
  )
})

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />}>
        <Route path="day/:date" element={<DayRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
