import { useEffect, useRef, useState } from 'react'
import type { components } from './generated/api-types'

type Issue = components['schemas']['SourceIssue']
type Connection = components['schemas']['DriveConnectionState']
const headers = { 'Content-Type': 'application/json', 'X-Live-Life-Action': '1' }

async function connectionRequest(url: string, init?: RequestInit): Promise<Connection> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message ?? 'Не удалось связаться с приложением. Повторите действие.')
  }
  return response.json()
}

export function DriveRecovery({ issue, syncing, retry }: {
  issue?: Issue | null
  syncing: boolean
  retry: () => void
}) {
  const [connection, setConnection] = useState<Connection>({ status: 'idle' })
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sequence = useRef(0)
  useEffect(() => () => { sequence.current += 1 }, [])

  const pending = connection.status === 'pending'
  useEffect(() => {
    if (!pending || !connection.sessionId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const next = await connectionRequest(`/api/google-drive/connection/${connection.sessionId}`)
        if (cancelled) return
        setConnection(next)
        if (next.status === 'pending') timer = setTimeout(poll, 1000)
      } catch (error) {
        if (cancelled) return
        setConnection({ status: 'failed' })
        setMessage(error instanceof Error ? error.message : 'Не удалось проверить подключение.')
      }
    }
    timer = setTimeout(poll, 1000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [pending, connection.sessionId])

  async function connect() {
    const current = ++sequence.current
    setBusy(true)
    setMessage(null)
    try {
      const next = await connectionRequest('/api/google-drive/connect', { method: 'POST', headers })
      if (current === sequence.current) setConnection(next)
    } catch (error) {
      if (current === sequence.current) setMessage(error instanceof Error ? error.message : 'Не удалось начать подключение.')
    } finally {
      if (current === sequence.current) setBusy(false)
    }
  }

  async function upload(file: File) {
    const current = ++sequence.current
    setMessage(null)
    if (file.size > 16384) {
      setMessage('Файл слишком большой. Выберите JSON OAuth-клиента типа Desktop app, скачанный из Google Cloud.')
      return
    }
    setBusy(true)
    try {
      const content = await file.text()
      if (current !== sequence.current) return
      const next = await connectionRequest('/api/google-drive/client', {
        method: 'POST', headers, body: JSON.stringify({ content }),
      })
      if (current !== sequence.current) return
      setConnection(next)
      if (next.status !== 'failed') setMessage('Настройки сохранены на этом компьютере. Теперь подключите Google Drive.')
    } catch (error) {
      if (current === sequence.current) setMessage(error instanceof Error ? error.message : 'Не удалось сохранить файл.')
    } finally {
      if (current === sequence.current) setBusy(false)
    }
  }

  const problem = connection.issue ?? issue
  const disabled = busy || pending || syncing
  return (
    <section className="drive-recovery" aria-labelledby="drive-recovery-title">
      <h3 id="drive-recovery-title">Подключение Google Drive</h3>
      <div aria-live="polite">
        {connection.status === 'success' ? (
          <p>Google Drive подключён. Нажмите «Повторить обновление», чтобы загрузить данные браслета.</p>
        ) : (
          <>
            <p>{problem?.message ?? 'Не удалось обновить браслет. Подключите Google Drive или проверьте настройки.'}</p>
          </>
        )}
        {pending && <p>Нажмите «Продолжить вход в Google», завершите вход в отдельной вкладке и вернитесь сюда. Сеанс действует 3 минуты.</p>}
        {message && <p role="status">{message}</p>}
      </div>
      <div className="drive-recovery-actions">
        <button className="button" disabled={disabled} onClick={() => void connect()}>
          {busy ? 'Подождите…' : 'Подключить Google Drive'}
        </button>
        {pending && connection.authorizationUrl && (
          <a className="button primary" href={connection.authorizationUrl} target="_blank" rel="noreferrer">Продолжить вход в Google</a>
        )}
        <button className="button" disabled={disabled} onClick={retry}>Повторить обновление</button>
      </div>
      <p className="drive-recovery-note">Ранее загруженные данные остаются доступны. Пароль вводится только на странице Google.</p>
      {connection.status !== 'success' && problem?.steps.length ? (
        <details><summary>Как восстановить доступ</summary><ol>{problem.steps.map(step => <li key={step}>{step}</li>)}</ol></details>
      ) : null}
      <details>
        <summary>Настроить Google Cloud или заменить удалённый проект</summary>
        <ol>
          <li>В <a href="https://console.cloud.google.com/cloud-resource-manager" target="_blank" rel="noreferrer">Google Cloud → Manage resources</a> выберите проект. Удалённый проект попробуйте восстановить в Resources pending deletion. Если восстановление недоступно, создайте новый проект.</li>
          <li>В этом проекте <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">включите Google Drive API</a>.</li>
          <li>В Google Auth Platform заполните Branding и настройте <a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer">Audience</a>. В режиме Testing добавьте свой аккаунт в Test users. Разрешение на Drive в этом режиме обычно действует 7 дней. Для постоянного использования рассмотрите Production; требования проверки определяет Google.</li>
          <li>В <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Clients</a> создайте OAuth client типа Desktop app, скачайте JSON и выберите его ниже. Android или Web application здесь не подходят.</li>
          <li>Нажмите «Подключить Google Drive», завершите вход и повторите обновление. Выберите аккаунт, которому доступна папка Reva Health Exporter.</li>
        </ol>
        <label className="drive-client-upload">JSON OAuth-клиента
          <input type="file" accept=".json,application/json" disabled={disabled} onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void upload(file)
          }} />
        </label>
        <p>Файл сохраняется только на этом компьютере. Создать или восстановить проект и подтвердить согласие нужно на стороне Google.</p>
        <p><a href="https://developers.google.com/identity/protocols/oauth2#expiration" target="_blank" rel="noreferrer">Почему разрешение может истечь</a> · <a href="https://developers.google.com/identity/protocols/oauth2/native-app" target="_blank" rel="noreferrer">Инструкция Google для Desktop app</a></p>
      </details>
      {problem?.diagnosticId && <small>Код: {problem.code} · Диагностика: {problem.diagnosticId}</small>}
    </section>
  )
}
