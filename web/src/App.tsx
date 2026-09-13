import { useEffect, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { dashboardStore as store, type DashboardDay } from './store'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
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

function CalendarCell({ day }: { day: DashboardDay }) {
  const date = new Date(`${day.date}T12:00:00Z`)
  const sourceAvailable = (source: string) => {
    const status = day.sources.find((item) => item.source === source)?.status
    return status === 'success' || status === 'partial'
  }
  return (
    <button
      className={`day-card quality-${day.quality}`}
      onClick={() => store.selectDay(day.date)}
      aria-label={`${day.date}. ${QUALITY[day.quality]}`}
    >
      <div className="date-row">
        <strong>{date.getUTCDate()}</strong>
        <span>{WEEKDAYS[day.weekday - 1]}</span>
      </div>
      <div className="numbers">
        <div><span>Сон</span><b>{hours(day.bracelet.sleepSeconds)}</b></div>
        <div><span>Шаги</span><b>{day.bracelet.steps?.toLocaleString('ru-RU') ?? '—'}</b></div>
        <div><span>Создано</span><b>{day.todoist.created}</b></div>
        <div><span>Закрыто</span><b>{day.todoist.completed}</b></div>
      </div>
      <div className="indicators" aria-label="Источники">
        <span className={sourceAvailable('welltory') ? 'on' : ''}>W</span>
        <span className={sourceAvailable('todoist') ? 'on' : ''}>T</span>
        <span className={sourceAvailable('rescuetime') ? 'on' : ''}>R</span>
      </div>
    </button>
  )
}

function MetricChart({ day, metric, color, title }: {
  day: DashboardDay
  metric: string
  color: string
  title: string
}) {
  const data = day.detail.braceletMetrics
    .filter((point) => point.metric === metric)
    .map((point) => ({
      time: new Date(point.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
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

function DayModal({ day }: { day: DashboardDay }) {
  const modalRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modalRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        store.selectDay(null)
        return
      }
      if (event.key !== 'Tab' || !modalRef.current) return
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
    }
  }, [])
  const sleep = day.detail.braceletMetrics.filter((point) => point.metric.startsWith('fitness_drive.sleep.'))
  const rescueActivity = day.detail.rescueTime.filter((item) => item.perspective === 'activity')
  const rescueProductivity = day.detail.rescueTime.filter((item) => item.perspective === 'productivity')
  return (
    <div className="modal-backdrop" onMouseDown={() => store.selectDay(null)}>
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
          <div>
            <p className="eyebrow">Подробности дня</p>
            <h2 id="day-title">{day.date}</h2>
          </div>
          <button className="icon-button" onClick={() => store.selectDay(null)} aria-label="Закрыть">×</button>
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
          <MetricChart day={day} metric="fitness_drive.heart_rate" color="#cf5c4f" title="Пульс" />
          <MetricChart day={day} metric="fitness_drive.oxygen_saturation" color="#3388a4" title="Кислород" />
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

export const App = observer(function App() {
  useEffect(() => {
    void store.load()
  }, [])
  const firstOffset = store.dashboard?.days[0] ? store.dashboard.days[0].weekday - 1 : 0
  return (
    <main className={store.selectedDay ? 'app blurred' : 'app'}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Локальный обзор</p>
          <h1>Live Life</h1>
          <p className="subtitle">30 дней · {store.from} — {store.to}</p>
        </div>
        <div className="actions">
          <button className="sync-button" onClick={() => void store.syncBracelet()} disabled={store.syncing}>
            {store.syncing ? 'Обновляем…' : 'Обновить браслет'}
          </button>
          <button className="help-button" onClick={() => store.toggleHelp()} aria-label="Легенда качества">?</button>
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

      <section className="calendar" aria-label="Календарь данных">
        {WEEKDAYS.map((day) => <div className="weekday" key={day}>{day}</div>)}
        {Array.from({ length: firstOffset }).map((_, i) => <div className="empty" key={`empty-${i}`} />)}
        {store.dashboard?.days.map((day) => <CalendarCell day={day} key={day.date} />)}
      </section>

      {store.selectedDay && <DayModal day={store.selectedDay} />}
    </main>
  )
})
