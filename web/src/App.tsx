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
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  buildRescueTimeOverview,
  formatRecordTime,
  isSourceAvailable,
  PRODUCTIVITY_LABELS,
} from './dayDetail'
import { inclusiveDateCount } from './dashboardWindow'
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
const SOURCE_ICONS = [
  { name: 'Браслет', description: 'Сон, шаги и другие измерения браслета', Icon: Watch },
  { name: 'Welltory', description: 'Измерения Welltory', Icon: HeartPulse },
  { name: 'Todoist', description: 'Созданные и завершённые задачи', Icon: ListTodo },
  { name: 'RescueTime', description: 'Активность и продуктивность', Icon: ChartNoAxesCombined },
]
const ACTIVITY_COLORS = ['#68a9c9', '#4c7f6d', '#d7a742', '#8f78b5', '#cf7c5c', '#789087']
const PRODUCTIVITY_COLORS: Record<string, string> = {
  '-2': '#cf5c4f',
  '-1': '#db8b51',
  '0': '#a7b3ae',
  '1': '#75b7d5',
  '2': '#4d82d8',
}

function hours(seconds: number | null) {
  return seconds == null ? '—' : `${(seconds / 3600).toFixed(1)} ч`
}

function duration(seconds: number) {
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return '< 1 мин'
  const wholeHours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (!wholeHours) return `${remainingMinutes} мин`
  return remainingMinutes ? `${wholeHours} ч ${remainingMinutes} мин` : `${wholeHours} ч`
}

function RecordTime({ timestamp, timezone }: { timestamp: string; timezone: string }) {
  return <time dateTime={timestamp}>{formatRecordTime(timestamp, timezone)}</time>
}

function monthLabel(date: string) {
  const label = MONTH_FORMAT.format(new Date(`${date.slice(0, 7)}-01T12:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const DashboardLegend = observer(function DashboardLegend() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!store.helpOpen) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) store.closeHelp()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') store.closeHelp()
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [store.helpOpen])

  return (
    <div className="help-container" ref={containerRef}>
      <button
        className="help-button"
        onClick={() => store.toggleHelp()}
        aria-label="Легенда качества и источников"
        aria-expanded={store.helpOpen}
        aria-controls="dashboard-legend"
      >
        <CircleHelp aria-hidden="true" />
      </button>
      {store.helpOpen && (
        <aside className="legend" id="dashboard-legend" aria-labelledby="legend-title">
          <div className="legend-header">
            <h2 id="legend-title">Легенда</h2>
            <button className="legend-close" onClick={() => store.closeHelp()} aria-label="Закрыть легенду">
              <X aria-hidden="true" />
            </button>
          </div>
          <section aria-labelledby="quality-legend-title">
            <h3 id="quality-legend-title">Цвет карточки</h3>
            {Object.entries(QUALITY).map(([key, label]) => (
              <p key={key}><i className={`legend-dot quality-${key}`} />{label}</p>
            ))}
          </section>
          <section className="source-legend" aria-labelledby="source-legend-title">
            <h3 id="source-legend-title">Иконки источников</h3>
            {SOURCE_ICONS.map(({ name, description, Icon }) => (
              <p key={name}>
                <i className="legend-source-icon"><Icon aria-hidden="true" /></i>
                <span><strong>{name}</strong><small>{description}</small></span>
              </p>
            ))}
            <p className="legend-note">Зелёная иконка — данные источника доступны; серая — недоступны.</p>
          </section>
        </aside>
      )}
    </div>
  )
})

function CalendarCell({ day }: { day: DashboardDay }) {
  const date = new Date(`${day.date}T12:00:00Z`)
  const braceletAvailable = isSourceAvailable(day, 'bracelet')
  const welltoryAvailable = isSourceAvailable(day, 'welltory')
  const todoistAvailable = isSourceAvailable(day, 'todoist')
  const rescuetimeAvailable = isSourceAvailable(day, 'rescuetime')
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
        <span className={braceletAvailable ? 'on' : ''} title="Браслет" aria-label={`Браслет: ${braceletAvailable ? 'данные доступны' : 'нет данных'}`}><Watch aria-hidden="true" /></span>
        <span className={welltoryAvailable ? 'on' : ''} title="Welltory" aria-label={`Welltory: ${welltoryAvailable ? 'данные доступны' : 'нет данных'}`}><HeartPulse aria-hidden="true" /></span>
        <span className={todoistAvailable ? 'on' : ''} title="Todoist" aria-label={`Todoist: ${todoistAvailable ? 'данные доступны' : 'нет данных'}`}><ListTodo aria-hidden="true" /></span>
        <span className={rescuetimeAvailable ? 'on' : ''} title="RescueTime" aria-label={`RescueTime: ${rescuetimeAvailable ? 'данные доступны' : 'нет данных'}`}><ChartNoAxesCombined aria-hidden="true" /></span>
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
    const handlePointerDown = (event: PointerEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        close()
      }
    }
    window.addEventListener('keydown', handleKey)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [navigate, previousDate, nextDate])
  const sleep = day.detail.braceletMetrics.filter((point) => point.metric.startsWith('fitness_drive.sleep.'))
  const rescueOverview = buildRescueTimeOverview(day.detail.rescueTime)
  const rescueIntervals = [...rescueOverview.activityRecords].sort(
    (left, right) => left.timestamp.localeCompare(right.timestamp),
  )
  return (
    <div className="modal-backdrop">
      <article
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
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
              {sleep.map((point) => (
                <div key={`${point.timestamp}-${point.metric}`}>
                  <span>
                    <RecordTime timestamp={point.timestamp} timezone={timezone} />
                    {point.metric.replace('fitness_drive.sleep.', '').replace('_seconds', '')}
                  </span>
                  <b>{hours(point.value)}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h3>Welltory</h3>
            <div className="measurement-grid">
              {day.detail.welltoryMetrics.map((point) => (
                <div key={`${point.timestamp}-${point.metric}`}>
                  <span>
                    <RecordTime timestamp={point.timestamp} timezone={timezone} />
                    {point.metric.replace('welltory.', '')}
                  </span>
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

        <div className="activity-detail-grid">
          <section className="panel">
            <h3>Todoist</h3>
            <h4>Созданные</h4>
            <ul className="record-list">
              {day.detail.createdTasks.map((task) => (
                <li key={`${task.timestamp}-${task.content}`}><RecordTime timestamp={task.timestamp} timezone={timezone} /><span>{task.content}</span></li>
              ))}
            </ul>
            <h4>Завершённые</h4>
            <ul className="record-list">
              {day.detail.completedTasks.map((task) => (
                <li key={`${task.timestamp}-${task.content}`}><RecordTime timestamp={task.timestamp} timezone={timezone} /><span>{task.content}</span></li>
              ))}
            </ul>
            {!day.detail.createdTasks.length && !day.detail.completedTasks.length && <p className="muted">Нет задач</p>}
          </section>

          <section className="panel rescuetime-panel">
            <div className="panel-heading">
              <div>
                <h3>RescueTime</h3>
                <p className="muted">Обзор отслеженного времени</p>
              </div>
              <div className="tracked-total">
                <span>Всего отслежено</span>
                <strong>{duration(rescueOverview.totalTrackedSeconds)}</strong>
              </div>
            </div>

            {rescueOverview.totalTrackedSeconds > 0 ? (
              <div className="rescuetime-overview">
                <div className="productivity-summary">
                  <h4>Индекс продуктивности</h4>
                  {rescueOverview.productivityIndex == null ? (
                    <p className="muted">Нет данных продуктивности</p>
                  ) : (
                    <>
                      <div
                        className="productivity-chart"
                        role="img"
                        aria-label={`Индекс продуктивности: ${rescueOverview.productivityIndex} из 100`}
                      >
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie
                              data={rescueOverview.productivity}
                              dataKey="seconds"
                              nameKey="name"
                              innerRadius={68}
                              outerRadius={96}
                              stroke="none"
                            >
                              {rescueOverview.productivity.map((level) => (
                                <Cell
                                  key={level.label}
                                  fill={PRODUCTIVITY_COLORS[level.label] ?? '#789087'}
                                />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => duration(Number(value))} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="productivity-chart-value">
                          <strong>{rescueOverview.productivityIndex}</strong>
                          <span>из 100</span>
                        </div>
                      </div>
                      <ul className="productivity-legend">
                        {rescueOverview.productivity.map((level) => (
                          <li key={level.label}>
                            <i style={{ background: PRODUCTIVITY_COLORS[level.label] ?? '#789087' }} />
                            <span>{PRODUCTIVITY_LABELS[level.label] ?? level.name}</span>
                            <b>{duration(level.seconds)}</b>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <p className="note">Локальный расчёт по уровням RescueTime от −2 до 2.</p>
                </div>

                <div className="activity-ranking">
                  <h4>Основные активности</h4>
                  {rescueOverview.categories.slice(0, 6).map((category, index) => (
                    <div className="activity-rank" key={category.label}>
                      <div>
                        <span><b>{Math.round(category.percentage)}%</b> {category.label}</span>
                        <time>{duration(category.seconds)}</time>
                      </div>
                      <i aria-hidden="true">
                        <span
                          style={{
                            width: `${category.percentage}%`,
                            background: ACTIVITY_COLORS[index % ACTIVITY_COLORS.length],
                          }}
                        />
                      </i>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="muted">Нет отслеженного времени</p>
            )}

            {rescueIntervals.length > 0 && (
              <div className="rescuetime-intervals">
                <h4>Интервалы активности</h4>
                <ul className="record-list scrollable-records">
                  {rescueIntervals.map((item) => (
                    <li key={`${item.timestamp}-${item.perspective}-${item.label}`}>
                      <RecordTime timestamp={item.timestamp} timezone={timezone} />
                      <span>{item.label}</span>
                      <b>{duration(item.seconds)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
  const displayedDayCount = store.dashboard?.days.length
    ?? inclusiveDateCount(store.from, store.to)
  return (
    <main className={dayMatch ? 'app blurred' : 'app'}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Локальный обзор</p>
          <h1>Live Life</h1>
          <p className="subtitle">Дней: {displayedDayCount} · {store.from} — {store.to}</p>
        </div>
        <div className="actions">
          <button className="sync-button" onClick={() => void store.syncBracelet()} disabled={store.syncing}>
            <RefreshCw className={store.syncing ? 'spinning' : undefined} aria-hidden="true" />
            {store.syncing ? 'Обновляем…' : 'Обновить браслет'}
          </button>
          <DashboardLegend />
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
