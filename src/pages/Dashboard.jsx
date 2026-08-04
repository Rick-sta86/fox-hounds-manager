import { useState, useEffect, useRef } from 'react'
import {
  collection,
  collectionGroup,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  addDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import {
  Check,
  Calendar,
  CalendarClock,
  AlertTriangle,
  ClipboardList,
  ListChecks,
  FolderKanban,
  Wrench,
  Trash2,
  Pencil,
  X,
  Save,
  Coffee,
  Pin,
  Plus,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  Wind,
  Droplets,
} from 'lucide-react'
import './Dashboard.css'

// ─── Quick links ─────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: 'Rotas',              url: 'https://drive.google.com/drive/u/0/folders/1KpwbEiC8ZRBlz6mnBUuR7BV6ltIEO_F_' },
  { label: 'Menus',              url: 'https://drive.google.com/drive/u/0/folders/16xPf6i2158BM8cEJzHklBUPdNMgm3Wlo' },
  { label: 'Stock Takes',        url: 'https://drive.google.com/drive/u/0/folders/147zxcc2g8hYFMoivRzxKfKxTFuvq8PuR' },
  { label: 'Deposit Statements', url: 'https://drive.google.com/drive/u/0/folders/11uimxBL-PNotTyom3N19piSR1jvzAj7e' },
]

// ─── Constants ────────────────────────────────────────────────────────────────

// Barley, Hertfordshire

const CADENCE_LABELS = {
  weekly: 'Weekly', monthly: 'Monthly', sixmonthly: '6-Monthly', yearly: 'Yearly',
}
const CADENCE_ORDER = ['weekly', 'monthly', 'sixmonthly', 'yearly']

const GOOGLE_CLIENT_ID = '997719695722-dvpragm91176o0mvam8900bu1b3qqlp4.apps.googleusercontent.com'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatToday() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function isOverdue(dateStr) {
  if (!dateStr) return false
  const [y, m, d] = dateStr.split('-')
  const due = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

function isDueThisWeek(dateStr) {
  if (!dateStr) return false
  const [y, m, d] = dateStr.split('-')
  const due = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const week  = new Date(today); week.setDate(today.getDate() + 7)
  return due >= today && due <= week
}

function formatDate(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-')
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short',
  })
}

function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-')
  const due = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((due - today) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  return `in ${diff} days`
}

function formatEventDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (date.getTime() === today.getTime())    return 'Today'
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow'
  const opts = { weekday: 'short', day: 'numeric', month: 'short' }
  if (date.getFullYear() !== today.getFullYear()) opts.year = 'numeric'
  return date.toLocaleDateString('en-GB', opts)
}

const EVENT_TYPE_LABELS = {
  private_hire: 'Private Hire',
  wine_dinner:  'Wine Dinner',
  newsells:     'Newsells',
  other:        'Other',
}

// ─── Weather helpers ──────────────────────────────────────────────────────────

function weatherIcon(code, size = 18) {
  if (code === 0)                return <Sun size={size} className="db-wx-icon db-wx-icon--sun" />
  if (code <= 3)                 return <Cloud size={size} className="db-wx-icon db-wx-icon--cloud" />
  if (code >= 51 && code <= 67)  return <CloudRain size={size} className="db-wx-icon db-wx-icon--rain" />
  if (code >= 71 && code <= 77)  return <CloudSnow size={size} className="db-wx-icon db-wx-icon--snow" />
  if (code >= 80 && code <= 82)  return <CloudRain size={size} className="db-wx-icon db-wx-icon--rain" />
  if (code >= 95)                return <CloudRain size={size} className="db-wx-icon db-wx-icon--storm" />
  return <Wind size={size} className="db-wx-icon db-wx-icon--wind" />
}

function weatherDesc(code) {
  if (code === 0)                return 'Clear'
  if (code === 1)                return 'Mostly clear'
  if (code === 2)                return 'Partly cloudy'
  if (code === 3)                return 'Overcast'
  if (code >= 51 && code <= 55)  return 'Drizzle'
  if (code >= 61 && code <= 65)  return 'Rain'
  if (code === 66 || code === 67) return 'Freezing rain'
  if (code >= 71 && code <= 77)  return 'Snow'
  if (code >= 80 && code <= 82)  return 'Rain showers'
  if (code >= 95)                return 'Thunderstorm'
  return 'Cloudy'
}

// ─── Clock hook ───────────────────────────────────────────────────────────────

function useClock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}


// ─── Google auth helpers ──────────────────────────────────────────────────────

function loadGoogleScript() {
  return new Promise((resolve) => {
    if (window.google) { resolve(); return; }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = resolve
    document.head.appendChild(script)
  })
}

function formatEventTime(dateTimeStr) {
  if (!dateTimeStr) return ''
  const d = new Date(dateTimeStr)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function isAllDay(event) {
  return Boolean(event.start?.date && !event.start?.dateTime)
}

// ─── WeatherWidget ────────────────────────────────────────────────────────────

const BARLEY_LAT = 52.0064
const BARLEY_LON = -0.0509

function WeatherWidget() {
  const [wx, setWx]             = useState(null)
  const [forecast, setForecast] = useState(null)
  const [open, setOpen]         = useState(false)
  const wrapperRef              = useRef(null)

  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${BARLEY_LAT}&longitude=${BARLEY_LON}` +
          `&current=temperature_2m,weathercode` +
          `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
          `&timezone=Europe%2FLondon&forecast_days=7`
        )
        const data = await res.json()
        setWx({ temp: Math.round(data.current.temperature_2m), code: data.current.weathercode })
        setForecast(data.daily)
      } catch { /* silent fail */ }
    }
    fetchWeather()
    const id = setInterval(fetchWeather, 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handle = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  if (!wx) return null

  return (
    <div className="db-wx-widget" ref={wrapperRef}>
      <button className="db-wx-chip" onClick={() => setOpen((v) => !v)}>
        {weatherIcon(wx.code, 15)}
        <span className="db-wx-chip-temp">{wx.temp}°C</span>
        <span className="db-wx-chip-desc">{weatherDesc(wx.code)}</span>
        <ChevronDown size={11} className={`db-wx-chip-chevron ${open ? 'db-wx-chip-chevron--open' : ''}`} />
      </button>

      {open && forecast && (
        <div className="db-wx-forecast">
          <div className="db-wx-forecast-days">
            {forecast.time.map((date, i) => {
              const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
                : new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
              const rain  = forecast.precipitation_probability_max[i]
              const hi    = Math.round(forecast.temperature_2m_max[i])
              const lo    = Math.round(forecast.temperature_2m_min[i])
              return (
                <div key={date} className={`db-wx-day ${i === 0 ? 'db-wx-day--today' : ''}`}>
                  <span className="db-wx-day-name">{label}</span>
                  <div className="db-wx-day-icon">{weatherIcon(forecast.weathercode[i], 24)}</div>
                  <span className="db-wx-day-cond">{weatherDesc(forecast.weathercode[i])}</span>
                  <div className="db-wx-day-temps">
                    <span className="db-wx-day-hi">{hi}°</span>
                    <span className="db-wx-day-lo">{lo}°</span>
                  </div>
                  {rain > 0 && (
                    <span className="db-wx-day-rain">
                      <Droplets size={10} />{rain}%
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="db-wx-forecast-footer mono">Barley, Hertfordshire · via Open-Meteo</div>
        </div>
      )}
    </div>
  )
}

// ─── MeetingsPanel ────────────────────────────────────────────────────────────

let _tokenClient = null
const MAX_DAYS_AHEAD = 7

function formatDayLabel(offset) {
  if (offset === 0) return "Today"
  if (offset === 1) return "Tomorrow"
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
}

function MeetingsPanel() {
  const [status, setStatus]     = useState('loading')
  const [eventsByDay, setEventsByDay] = useState({}) // keyed by offset 0-6
  const [dayOffset, setDayOffset]     = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const tokenRef                = useRef(null)

  const fetchEventsForDay = async (accessToken, offset) => {
    const base = new Date()
    base.setDate(base.getDate() + offset)
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate()).toISOString()
    const end   = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59).toISOString()
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) throw new Error('Calendar fetch failed')
    const data = await res.json()
    return data.items || []
  }

  const saveToken = (accessToken) => {
    tokenRef.current = accessToken
    localStorage.setItem('cal_token', accessToken)
    localStorage.setItem('cal_token_expiry', Date.now() + 55 * 60 * 1000) // 55 min (tokens last 60)
  }

  const getCachedToken = () => {
    const token = localStorage.getItem('cal_token')
    const expiry = parseInt(localStorage.getItem('cal_token_expiry') || '0', 10)
    if (token && Date.now() < expiry) return token
    return null
  }

  const fetchAllDays = async (accessToken) => {
    try {
      // Fetch today first so it shows fast, then rest in background
      const todayEvents = await fetchEventsForDay(accessToken, 0)
      setEventsByDay((prev) => ({ ...prev, 0: todayEvents }))
      setStatus('authed')
      // Fetch remaining days
      for (let i = 1; i < MAX_DAYS_AHEAD; i++) {
        const events = await fetchEventsForDay(accessToken, i)
        setEventsByDay((prev) => ({ ...prev, [i]: events }))
      }
      // Persist account hint for future silent re-auth
      try {
        const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        if (info.ok) {
          const { email } = await info.json()
          if (email) localStorage.setItem('cal_email', email)
        }
      } catch { /* non-critical */ }
    } catch (e) {
      console.error(e)
      setErrorMsg('Failed to load events.')
      setStatus('error')
    }
  }

  const initTokenClient = (loginHint, callback) => {
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: CALENDAR_SCOPE,
      ...(loginHint && { login_hint: loginHint }),
      callback,
    })
    return _tokenClient
  }

  useEffect(() => {
    let cancelled = false
    async function tryAutoConnect() {
      const wasConnected = localStorage.getItem('cal_connected') === '1'
      if (!wasConnected) { setStatus('needs-consent'); return }

      // Use cached token if still valid — no GIS call needed
      const cached = getCachedToken()
      if (cached) {
        tokenRef.current = cached
        await fetchAllDays(cached)
        return
      }

      try {
        await loadGoogleScript()
        const loginHint = localStorage.getItem('cal_email')
        initTokenClient(loginHint, async (response) => {
          if (cancelled) return
          if (response.error) { setStatus('needs-consent'); return }
          saveToken(response.access_token)
          localStorage.setItem('cal_connected', '1')
          await fetchAllDays(response.access_token)
        })
        _tokenClient.requestAccessToken({ prompt: '' })
      } catch {
        if (!cancelled) setStatus('needs-consent')
      }
    }
    tryAutoConnect()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (!_tokenClient) return
      _tokenClient.requestAccessToken({ prompt: '' })
    }, 45 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const handleConnect = async () => {
    setStatus('loading')
    try {
      await loadGoogleScript()
      initTokenClient(null, async (response) => {
        if (response.error) { setErrorMsg('Sign-in was cancelled or failed.'); setStatus('error'); return }
        saveToken(response.access_token)
        localStorage.setItem('cal_connected', '1')
        await fetchAllDays(response.access_token)
      })
      _tokenClient.requestAccessToken({ prompt: 'consent' })
    } catch (e) {
      console.error(e)
      setErrorMsg('Failed to initialise Google sign-in.')
      setStatus('error')
    }
  }

  const handleRefresh = () => {
    if (_tokenClient) _tokenClient.requestAccessToken({ prompt: '' })
  }

  const events    = eventsByDay[dayOffset] ?? null
  const dayLabel  = formatDayLabel(dayOffset)
  const canGoBack = dayOffset > 0
  const canGoFwd  = dayOffset < MAX_DAYS_AHEAD - 1

  return (
    <div className="db-panel db-panel--meetings">
      <div className="db-panel-header">
        <Calendar size={15} className="db-panel-icon" />
        <h2 className="db-panel-title">{dayLabel}</h2>
        {status === 'authed' && (
          <div className="db-cal-nav">
            <button
              className="db-cal-nav-btn"
              onClick={() => setDayOffset((v) => v - 1)}
              disabled={!canGoBack}
              title="Previous day"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              className="db-cal-nav-btn"
              onClick={() => setDayOffset((v) => v + 1)}
              disabled={!canGoFwd}
              title="Next day"
            >
              <ChevronRight size={14} />
            </button>
            <button className="db-cal-refresh" onClick={handleRefresh} title="Refresh">↻</button>
          </div>
        )}
      </div>

      {status === 'loading' && (
        <div className="db-meetings-connect"><span className="db-spinner db-spinner--sm" /></div>
      )}

      {status === 'needs-consent' && (
        <div className="db-meetings-connect">
          <Coffee size={20} className="db-connect-icon" />
          <p className="db-connect-msg">Connect Google Calendar to see your meetings.</p>
          <button className="db-cal-connect-btn" onClick={handleConnect}>Connect Calendar</button>
        </div>
      )}

      {status === 'error' && (
        <div className="db-meetings-connect">
          <p className="db-connect-msg" style={{ color: 'var(--red)' }}>{errorMsg}</p>
          <button className="db-cal-connect-btn" onClick={handleConnect}>Try again</button>
        </div>
      )}

      {status === 'authed' && events === null && (
        <div className="db-meetings-connect"><span className="db-spinner db-spinner--sm" /></div>
      )}

      {status === 'authed' && events !== null && events.length === 0 && (
        <div className="db-meetings-connect">
          <p className="db-connect-msg">No meetings {dayOffset === 0 ? 'today' : formatDayLabel(dayOffset).toLowerCase()}.</p>
        </div>
      )}

      {status === 'authed' && events !== null && events.length > 0 && (
        <div className="db-events-list">
          {events.map((event) => (
            <div key={event.id} className="db-event-row">
              <div className="db-event-time mono">
                {isAllDay(event)
                  ? <span className="db-event-allday">All day</span>
                  : <>{formatEventTime(event.start?.dateTime)}<span className="db-event-sep">–</span>{formatEventTime(event.end?.dateTime)}</>
                }
              </div>
              <div className="db-event-details">
                <span className="db-event-title">{event.summary || '(No title)'}</span>
                {event.location && <span className="db-event-location">{event.location}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── UrgentPanel (Overdue + Due This Week merged) ────────────────────────────

function UrgentPanel({ tasksByCadence, onToggle }) {
  const overdueTasks = CADENCE_ORDER.flatMap((cadence) =>
    (tasksByCadence[cadence] || [])
      .filter((t) => !t.completed && isOverdue(t.dueDate))
      .map((t) => ({ ...t, cadence }))
  )
  const dueTasks = CADENCE_ORDER.flatMap((cadence) =>
    (tasksByCadence[cadence] || [])
      .filter((t) => !t.completed && isDueThisWeek(t.dueDate))
      .map((t) => ({ ...t, cadence }))
  ).sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  if (overdueTasks.length === 0 && dueTasks.length === 0) return null

  return (
    <div className="db-panel db-panel--urgent">
      <div className="db-panel-header">
        <AlertTriangle size={15} className="db-panel-icon db-panel-icon--red" />
        <h2 className="db-panel-title db-panel-title--red">Urgent</h2>
        {overdueTasks.length > 0 && (
          <span className="db-overdue-count mono">{overdueTasks.length} overdue</span>
        )}
        {dueTasks.length > 0 && (
          <span className="db-dueweek-count mono">{dueTasks.length} this week</span>
        )}
      </div>

      {overdueTasks.length > 0 && (
        <>
          <div className="db-urgent-section-label">OVERDUE</div>
          <div className="db-overdue-list">
            {overdueTasks.map((task) => (
              <div key={task.id} className="db-overdue-row">
                <button
                  className="db-checkbox"
                  onClick={() => onToggle(task.id, task.completed)}
                  title="Mark complete"
                >
                  <Check size={10} strokeWidth={3} />
                </button>
                <span className="db-overdue-text">{task.text}</span>
                <span className="db-overdue-meta mono">
                  <span className="db-overdue-cadence">{CADENCE_LABELS[task.cadence]}</span>
                  <span className="db-overdue-date">{formatDate(task.dueDate)}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {dueTasks.length > 0 && (
        <>
          <div className="db-urgent-section-label db-urgent-section-label--amber">DUE THIS WEEK</div>
          <div className="db-overdue-list">
            {dueTasks.map((task) => (
              <div key={task.id} className="db-overdue-row">
                <button
                  className="db-checkbox"
                  onClick={() => onToggle(task.id, task.completed)}
                  title="Mark complete"
                >
                  <Check size={10} strokeWidth={3} />
                </button>
                <span className="db-overdue-text">{task.text}</span>
                <span className="db-overdue-meta mono">
                  <span className="db-overdue-cadence">{CADENCE_LABELS[task.cadence]}</span>
                  <span className="db-dueweek-when">{daysUntil(task.dueDate)}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── ChecklistProgress ────────────────────────────────────────────────────────

function ChecklistProgress({ tasksByCadence, onNavigate, onViewChange }) {
  return (
    <div className="db-panel db-panel--progress">
      <div className="db-panel-header">
        <ListChecks size={15} className="db-panel-icon" />
        <h2 className="db-panel-title">Checklists</h2>
      </div>
      <div className="db-progress-grid">
        {CADENCE_ORDER.map((cadence) => {
          const tasks   = tasksByCadence[cadence] || []
          const done    = tasks.filter((t) => t.completed).length
          const total   = tasks.length
          const pct     = total ? Math.round((done / total) * 100) : 0
          const allDone = total > 0 && done === total
          const overdue = tasks.filter((t) => !t.completed && isOverdue(t.dueDate)).length
          return (
            <button
              key={cadence}
              className={`db-progress-card ${allDone ? 'db-progress-card--done' : ''}`}
              onClick={() => { onNavigate('checklists'); onViewChange(cadence) }}
            >
              <div className="db-progress-card-header">
                <span className="db-progress-label mono">{CADENCE_LABELS[cadence]}</span>
                {overdue > 0 && <span className="db-progress-overdue mono">{overdue} overdue</span>}
                {allDone && <span className="db-progress-done-label mono">DONE</span>}
              </div>
              <div className="db-progress-numbers">
                <span className="db-progress-done">{done}</span>
                <span className="db-progress-sep">/</span>
                <span className="db-progress-total">{total}</span>
              </div>
              <div className="db-progress-track">
                <div
                  className={`db-progress-fill ${allDone ? 'db-progress-fill--done' : ''}`}
                  style={{ width: total ? `${pct}%` : '0%' }}
                />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── ProjectTasksPanel ────────────────────────────────────────────────────────

function ProjectTasksPanel({ onNavigateToProject }) {
  const [tasks, setTasks]             = useState([])
  const [projectsById, setProjectsById] = useState({})
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    return onSnapshot(collection(db, 'projects'), (snap) => {
      const map = {}
      snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } })
      setProjectsById(map)
    })
  }, [])

  useEffect(() => {
    return onSnapshot(
      collectionGroup(db, 'tasks'),
      (snap) => {
        setTasks(snap.docs.map((d) => ({
          id: d.id,
          projectId: d.ref.parent.parent.id,
          ...d.data(),
        })))
        setLoading(false)
      },
      (err) => { console.error('Project tasks listener error:', err); setLoading(false) }
    )
  }, [])

  const upcoming = tasks
    .filter((t) => !t.completed && t.dueDate && projectsById[t.projectId] && projectsById[t.projectId].status !== 'completed')
    .map((t) => ({ ...t, projectTitle: projectsById[t.projectId]?.title || 'Untitled project' }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  return (
    <div className="db-panel db-panel--project-tasks">
      <div className="db-panel-header">
        <FolderKanban size={15} className="db-panel-icon" />
        <h2 className="db-panel-title">Project Tasks</h2>
        {upcoming.length > 0 && (
          <span className="db-tackle-count mono">{upcoming.length} upcoming</span>
        )}
      </div>

      {loading && (
        <div className="db-meetings-connect"><span className="db-spinner db-spinner--sm" /></div>
      )}

      {!loading && upcoming.length === 0 && (
        <div className="db-tackle-empty">
          <Check size={16} className="db-tackle-empty-icon" />
          <span>No upcoming project tasks.</span>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="db-project-tasks-list">
          {upcoming.map((task) => {
            const overdue = isOverdue(task.dueDate)
            const soon    = !overdue && isDueThisWeek(task.dueDate)
            return (
              <button
                key={task.id}
                className="db-project-task-row"
                onClick={() => onNavigateToProject?.(task.projectId)}
              >
                <span className="db-project-task-project mono">{task.projectTitle}</span>
                <span className="db-project-task-title">{task.title}</span>
                <span className={`db-project-task-due ${overdue ? 'db-project-task-due--overdue' : ''} ${soon ? 'db-project-task-due--soon' : ''}`}>
                  {overdue && <span className="db-tackle-due-dot" />}
                  {formatDate(task.dueDate)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── PinnedNoticesPanel ───────────────────────────────────────────────────────

function PinnedNoticesPanel() {
  const [notices, setNotices]   = useState([])
  const [addText, setAddText]   = useState('')
  const inputRef                = useRef(null)

  useEffect(() => {
    const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setNotices(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    const trimmed = addText.trim()
    if (!trimmed) return
    await addDoc(collection(db, 'notices'), {
      text: trimmed,
      createdAt: serverTimestamp(),
    })
    setAddText('')
    inputRef.current?.focus()
  }

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, 'notices', id))
  }

  return (
    <div className="db-panel db-panel--notices">
      <div className="db-panel-header">
        <Pin size={15} className="db-panel-icon db-panel-icon--amber" />
        <h2 className="db-panel-title">Pinned Notices</h2>
        {notices.length > 0 && (
          <span className="db-notices-count mono">{notices.length}</span>
        )}
      </div>

      {notices.length === 0 && (
        <div className="db-notices-empty">No notices pinned.</div>
      )}

      {notices.length > 0 && (
        <div className="db-notices-list">
          {notices.map((n) => (
            <div key={n.id} className="db-notice-row">
              <span className="db-notice-dot" />
              <span className="db-notice-text">{n.text}</span>
              <button
                className="db-action db-action--delete db-notice-delete"
                onClick={() => handleDelete(n.id)}
                title="Remove notice"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form className="db-notices-add" onSubmit={handleAdd}>
        <Plus size={13} className="db-notices-add-icon" />
        <input
          ref={inputRef}
          className="db-notices-input"
          placeholder="Add a notice…"
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
        />
        {addText.trim() && (
          <button type="submit" className="db-notices-submit">Pin</button>
        )}
      </form>
    </div>
  )
}

// ─── TackleListPanel ──────────────────────────────────────────────────────────

function TackleListPanel({ tasks, onToggle, onDelete, onUpdateText, onAdd }) {
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText]   = useState('')
  const [addText, setAddText]     = useState('')
  const editRef                   = useRef(null)
  const addRef                    = useRef(null)

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus()
  }, [editingId])

  const startEdit = (task) => { setEditingId(task.id); setEditText(task.text) }
  const commitEdit = (id) => {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== tasks.find((t) => t.id === id)?.text) onUpdateText(id, trimmed)
    setEditingId(null)
  }
  const cancelEdit = () => setEditingId(null)
  const handleEditKey = (e, id) => {
    if (e.key === 'Enter') commitEdit(id)
    if (e.key === 'Escape') cancelEdit()
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    const trimmed = addText.trim()
    if (!trimmed) return
    await onAdd(trimmed)
    setAddText('')
    addRef.current?.focus()
  }

  const pending = tasks.filter((t) => !t.completed)
  const done    = tasks.filter((t) => t.completed)
  const sorted  = [...pending, ...done]

  return (
    <div className="db-panel db-panel--tackle">
      <div className="db-panel-header">
        <ClipboardList size={15} className="db-panel-icon" />
        <h2 className="db-panel-title">Tackle List</h2>
        <span className="db-tackle-count mono">{pending.length} remaining</span>
      </div>

      {/* Quick-add */}
      <form className="db-tackle-quickadd" onSubmit={handleAdd}>
        <Plus size={13} className="db-notices-add-icon" />
        <input
          ref={addRef}
          className="db-notices-input"
          placeholder="Quick-add a task…"
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
        />
        {addText.trim() && (
          <button type="submit" className="db-notices-submit">Add</button>
        )}
      </form>

      {sorted.length === 0 ? (
        <div className="db-tackle-empty">
          <Check size={16} className="db-tackle-empty-icon" />
          <span>Tackle list is clear.</span>
        </div>
      ) : (
        <div className="db-tackle-list">
          {sorted.map((task) => (
            <div
              key={task.id}
              className={`db-tackle-row ${task.completed ? 'db-tackle-row--done' : ''}`}
            >
              <button
                className={`db-checkbox ${task.completed ? 'db-checkbox--checked' : ''}`}
                onClick={() => onToggle(task.id, task.completed)}
              >
                {task.completed && <Check size={10} strokeWidth={3} />}
              </button>

              {editingId === task.id ? (
                <input
                  ref={editRef}
                  className="db-tackle-edit"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => handleEditKey(e, task.id)}
                />
              ) : (
                <span
                  className="db-tackle-text"
                  onDoubleClick={() => !task.completed && startEdit(task)}
                >
                  {task.text}
                </span>
              )}

              {/* Due date badge */}
              {!task.completed && task.dueDate && (() => {
                const overdue = isOverdue(task.dueDate)
                const soon    = !overdue && isDueThisWeek(task.dueDate)
                return (
                  <span className={`db-tackle-due ${overdue ? 'db-tackle-due--overdue' : ''} ${soon ? 'db-tackle-due--soon' : ''}`}>
                    {overdue && <span className="db-tackle-due-dot" />}
                    {formatDate(task.dueDate)}
                  </span>
                )
              })()}

              <div className="db-tackle-actions">
                {editingId === task.id ? (
                  <>
                    <button className="db-action db-action--save" onClick={() => commitEdit(task.id)} title="Save">
                      <Save size={12} />
                    </button>
                    <button className="db-action" onClick={cancelEdit} title="Cancel">
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    {!task.completed && (
                      <button className="db-action" onClick={() => startEdit(task)} title="Edit">
                        <Pencil size={12} />
                      </button>
                    )}
                    <button className="db-action db-action--delete" onClick={() => onDelete(task.id)} title="Delete">
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── UpcomingEventsPanel ──────────────────────────────────────────────────────

function UpcomingEventsPanel({ onNavigateToEvent }) {
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onSnapshot(
      collection(db, 'events'),
      (snap) => {
        setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => { console.error('Events listener error:', err); setLoading(false) }
    )
  }, [])

  const upcoming = events
    .filter((e) => (e.status === 'planning' || e.status === 'confirmed') && e.eventDate)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))

  if (!loading && upcoming.length === 0) return null

  return (
    <div className="db-panel db-panel--upcoming-events">
      <div className="db-panel-header">
        <CalendarClock size={15} className="db-panel-icon" />
        <h2 className="db-panel-title">Upcoming Events</h2>
        {upcoming.length > 0 && (
          <span className="db-tackle-count mono">{upcoming.length} upcoming</span>
        )}
      </div>

      {loading && (
        <div className="db-meetings-connect"><span className="db-spinner db-spinner--sm" /></div>
      )}

      {upcoming.length > 0 && (
        <div className="db-upcoming-events-list">
          {upcoming.map((event) => (
            <button
              key={event.id}
              className="db-upcoming-event-row"
              onClick={() => onNavigateToEvent?.(event.id, 'notes')}
            >
              <div className="db-upcoming-event-main">
                <span className="db-upcoming-event-title">{event.title}</span>
                <span className={`db-event-type-badge db-event-type-badge--${event.type || 'other'}`}>
                  {EVENT_TYPE_LABELS[event.type] || 'Other'}
                </span>
              </div>
              <div className="db-upcoming-event-meta">
                <span className={`db-event-status-badge db-event-status-badge--${event.status}`}>
                  {event.status === 'planning' ? 'Planning' : 'Confirmed'}
                </span>
                <span className="db-upcoming-event-date mono">{formatEventDate(event.eventDate)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── EventTasksPanel ──────────────────────────────────────────────────────────

function EventTasksPanel({ onNavigateToEvent }) {
  const [tasks, setTasks]           = useState([])
  const [eventsById, setEventsById] = useState({})
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    return onSnapshot(
      collection(db, 'events'),
      (snap) => {
        const map = {}
        snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } })
        setEventsById(map)
      },
      (err) => console.error('Event map listener error:', err)
    )
  }, [])

  useEffect(() => {
    return onSnapshot(
      collectionGroup(db, 'tasks'),
      (snap) => {
        setTasks(snap.docs
          .filter((d) => d.ref.parent.parent.parent.id === 'events')
          .map((d) => ({
            id: d.id,
            eventId: d.ref.parent.parent.id,
            ...d.data(),
          })))
        setLoading(false)
      },
      (err) => { console.error('Event tasks listener error:', err); setLoading(false) }
    )
  }, [])

  const upcoming = tasks
    .filter((t) => {
      const ev = eventsById[t.eventId]
      return !t.completed && t.dueDate && ev && (ev.status === 'planning' || ev.status === 'confirmed')
    })
    .map((t) => ({ ...t, eventTitle: eventsById[t.eventId]?.title || 'Untitled event' }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  if (!loading && upcoming.length === 0) return null

  return (
    <div className="db-panel db-panel--event-tasks">
      <div className="db-panel-header">
        <CalendarClock size={15} className="db-panel-icon" />
        <h2 className="db-panel-title">Event Tasks</h2>
        {upcoming.length > 0 && (
          <span className="db-tackle-count mono">{upcoming.length} upcoming</span>
        )}
      </div>

      {loading && (
        <div className="db-meetings-connect"><span className="db-spinner db-spinner--sm" /></div>
      )}

      {upcoming.length > 0 && (
        <div className="db-project-tasks-list">
          {upcoming.map((task) => {
            const overdue = isOverdue(task.dueDate)
            const soon    = !overdue && isDueThisWeek(task.dueDate)
            return (
              <button
                key={task.id}
                className="db-project-task-row"
                onClick={() => onNavigateToEvent?.(task.eventId)}
              >
                <span className="db-project-task-project mono">{task.eventTitle}</span>
                <span className="db-project-task-title">{task.title}</span>
                <span className={`db-project-task-due ${overdue ? 'db-project-task-due--overdue' : ''} ${soon ? 'db-project-task-due--soon' : ''}`}>
                  {overdue && <span className="db-tackle-due-dot" />}
                  {formatDate(task.dueDate)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── MaintenancePanel ─────────────────────────────────────────────────────────

const MNT_PRIORITY_ORDER  = { urgent: 0, high: 1, medium: 2, low: 3 }
const MNT_PRIORITY_LABELS = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }
const MNT_CATEGORY_LABELS = {
  plumbing: 'Plumbing', electrical: 'Electrical',
  structural: 'Structural', equipment: 'Equipment', other: 'Other',
}

function MaintenancePanel({ onNavigateToMaintenance }) {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onSnapshot(
      collection(db, 'maintenance'),
      (snap) => {
        setIssues(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => { console.error('Maintenance panel error:', err); setLoading(false) }
    )
  }, [])

  const active = issues
    .filter((i) => i.status !== 'done')
    .sort((a, b) => {
      const pa = MNT_PRIORITY_ORDER[a.priority] ?? 4
      const pb = MNT_PRIORITY_ORDER[b.priority] ?? 4
      if (pa !== pb) return pa - pb
      return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
    })

  if (!loading && active.length === 0) return null

  return (
    <div className="db-panel db-panel--maintenance">
      <div className="db-panel-header">
        <Wrench size={15} className="db-panel-icon" />
        <h2 className="db-panel-title">Maintenance</h2>
        {active.length > 0 && (
          <span className="db-tackle-count mono">{active.length} open</span>
        )}
      </div>

      {loading && (
        <div className="db-meetings-connect"><span className="db-spinner db-spinner--sm" /></div>
      )}

      {active.length > 0 && (
        <div className="db-maintenance-list">
          {active.map((issue) => (
            <button
              key={issue.id}
              className="db-maintenance-row"
              onClick={() => onNavigateToMaintenance?.(issue.id)}
            >
              <span className={`db-mnt-priority db-mnt-priority--${issue.priority || 'medium'}`}>
                {MNT_PRIORITY_LABELS[issue.priority] || 'Medium'}
              </span>
              <span className="db-maintenance-title">{issue.title}</span>
              <span className="db-mnt-category mono">
                {MNT_CATEGORY_LABELS[issue.category] || 'Other'}
              </span>
              <span className={`db-mnt-status db-mnt-status--${issue.status || 'open'}`}>
                {issue.status
                  ? issue.status.charAt(0).toUpperCase() + issue.status.slice(1)
                  : 'Open'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Dashboard (page) ─────────────────────────────────────────────────────────

export default function Dashboard({ onNavigate, onViewChange, onNavigateToProject, onNavigateToEvent, onNavigateToMaintenance }) {
  const [tasksByCadence, setTasksByCadence] = useState({
    weekly: [], monthly: [], sixmonthly: [], yearly: [],
  })
  const [tackleTasks, setTackleTasks] = useState([])
  const [loading, setLoading]         = useState(true)
  const time                          = useClock()

  useEffect(() => {
    const q = query(collection(db, 'recurring_tasks'), orderBy('order', 'asc'))
    return onSnapshot(q, (snap) => {
      const grouped = { weekly: [], monthly: [], sixmonthly: [], yearly: [] }
      snap.forEach((d) => {
        const t = { id: d.id, ...d.data() }
        if (grouped[t.cadence]) grouped[t.cadence].push(t)
      })
      setTasksByCadence(grouped)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'tackle_list'), orderBy('order', 'asc'))
    return onSnapshot(q, (snap) => {
      setTackleTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  const handleTackleToggle     = async (id, current) =>
    updateDoc(doc(db, 'tackle_list', id), { completed: !current })

  const handleTackleDelete     = async (id) =>
    deleteDoc(doc(db, 'tackle_list', id))

  const handleTackleUpdateText = async (id, text) =>
    updateDoc(doc(db, 'tackle_list', id), { text })

  const handleTackleAdd = async (text) => {
    const maxOrder = tackleTasks.length
      ? Math.max(...tackleTasks.map((t) => t.order ?? 0))
      : -1
    await addDoc(collection(db, 'tackle_list'), {
      text, completed: false, dueDate: null,
      order: maxOrder + 1,
      createdAt: serverTimestamp(),
    })
  }

  const handleChecklistToggle  = async (id, current) =>
    updateDoc(doc(db, 'recurring_tasks', id), { completed: !current })

  if (loading) {
    return (
      <div className="db-state">
        <span className="db-spinner" />
        Loading dashboard…
      </div>
    )
  }

  const allTasks      = CADENCE_ORDER.flatMap((c) => tasksByCadence[c] || [])
  const overdueCount  = allTasks.filter((t) => !t.completed && isOverdue(t.dueDate)).length
  const dueWeekCount  = allTasks.filter((t) => !t.completed && isDueThisWeek(t.dueDate)).length
  const tacklePending = tackleTasks.filter((t) => !t.completed).length

  return (
    <div className="db-page">
      <header className="db-header">
        <div className="db-header-inner">
          <p className="db-greeting mono">{formatToday()}</p>
          <h1 className="db-title">{getGreeting()}</h1>
        </div>
        <WeatherWidget />
        <div className="db-clock mono">{time}</div>
      </header>

      {/* KPI strip */}
      <div className="db-kpi-strip">
        <div className="db-kpi">
          <span className={`db-kpi__value ${overdueCount > 0 ? 'db-kpi__value--red' : 'db-kpi__value--green'}`}>
            {overdueCount}
          </span>
          <span className="db-kpi__label">Overdue</span>
        </div>
        <div className="db-kpi">
          <span className={`db-kpi__value ${dueWeekCount > 0 ? 'db-kpi__value--amber' : 'db-kpi__value--green'}`}>
            {dueWeekCount}
          </span>
          <span className="db-kpi__label">Due This Week</span>
        </div>
        <div className="db-kpi">
          <span className="db-kpi__value db-kpi__value--teal">{tacklePending}</span>
          <span className="db-kpi__label">On Tackle List</span>
        </div>

        {/* Quick links — pushed to the right */}
        <div className="db-quicklinks">
          {QUICK_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="db-quicklink"
            >
              <FolderOpen size={13} />
              <span>{link.label}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="db-grid">
        {/* Left column — primary action tools */}
        <div className="db-col db-col--left">
          <TackleListPanel
            tasks={tackleTasks}
            onToggle={handleTackleToggle}
            onDelete={handleTackleDelete}
            onUpdateText={handleTackleUpdateText}
            onAdd={handleTackleAdd}
          />
          <ChecklistProgress
            tasksByCadence={tasksByCadence}
            onNavigate={onNavigate}
            onViewChange={onViewChange}
          />
        </div>

        {/* Right column — context and alerts */}
        <div className="db-col db-col--right">
          <MeetingsPanel />
          <UpcomingEventsPanel onNavigateToEvent={onNavigateToEvent} />
          <UrgentPanel tasksByCadence={tasksByCadence} onToggle={handleChecklistToggle} />
          <ProjectTasksPanel onNavigateToProject={onNavigateToProject} />
          <EventTasksPanel onNavigateToEvent={onNavigateToEvent} />
          <MaintenancePanel onNavigateToMaintenance={onNavigateToMaintenance} />
          <PinnedNoticesPanel />
        </div>
      </div>
    </div>
  )
}
