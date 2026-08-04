import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Mail, AlertCircle, Clock, Edit3, Archive, CheckCircle2, RefreshCw,
} from 'lucide-react'
import './Inbox.css'

const GIST_RAW_URL =
  'https://gist.githubusercontent.com/Rick-sta86/a183b86ac5931e0c1c574538b465fb13/raw/inbox.json'
const STALE_DAYS = 7

const COLUMNS = [
  { key: 'needs_you',      label: 'Needs You',      icon: AlertCircle  },
  { key: 'drafts',         label: 'Drafts',         icon: Edit3        },
  { key: 'awaiting_reply', label: 'Awaiting Reply', icon: Clock        },
  { key: 'parked',         label: 'Parked',         icon: Archive      },
  { key: 'actioned',       label: 'Actioned',       icon: CheckCircle2 },
]

// ── Helpers ───────────────────────────────────────────────────────────────

function parseDate(value) {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function daysAgo(value) {
  const d = parseDate(value)
  if (!d) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function formatSince(value) {
  const days = daysAgo(value)
  if (days === null) return value || '—'
  if (days <= 0)  return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30)  return `${days} days ago`
  return parseDate(value).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── InboxCard ─────────────────────────────────────────────────────────────

function InboxCard({ item, onMove }) {
  const dateValue = item.since || item.date
  const days      = daysAgo(dateValue)
  const isStale   = item.category !== 'actioned' && days !== null && days > STALE_DAYS

  return (
    <div className={`inbox-card ${isStale ? 'inbox-card--stale' : ''}`}>
      <div className="inbox-card-top">
        <span className="inbox-card-who">{item.who || 'Unknown'}</span>
        {isStale && <AlertCircle size={13} className="inbox-stale-icon" />}
      </div>
      <p className="inbox-card-what">{item.what || ''}</p>
      <div className="inbox-card-bottom">
        <span className="inbox-card-since mono">
          <Clock size={11} />
          {formatSince(dateValue)}
        </span>
        <select
          className="inbox-move-select mono"
          value={item.category}
          onChange={(e) => onMove(item.id, e.target.value)}
          title="Move to…"
        >
          {COLUMNS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// ── InboxColumn ───────────────────────────────────────────────────────────

function InboxColumn({ column, items, onMove }) {
  const Icon = column.icon
  return (
    <div className="inbox-column">
      <div className="inbox-column-header">
        <span className="inbox-column-title">
          <Icon size={14} strokeWidth={1.75} />
          {column.label}
        </span>
        {items.length > 0 && (
          <span className="inbox-column-count mono">{items.length}</span>
        )}
      </div>
      <div className="inbox-column-list">
        {items.length === 0 ? (
          <p className="inbox-empty">Nothing here.</p>
        ) : (
          items.map((item) => (
            <InboxCard key={item.id} item={item} onMove={onMove} />
          ))
        )}
      </div>
    </div>
  )
}

// ── Inbox (page) ──────────────────────────────────────────────────────────

export default function Inbox() {
  const [items,       setItems]       = useState([])
  const [lastFetched, setLastFetched] = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  const fetchGist = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${GIST_RAW_URL}?t=${Date.now()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      // Flatten all column arrays into a single items list
      const allItems = []
      COLUMNS.forEach((col) => {
        const arr = Array.isArray(data[col.key]) ? data[col.key] : []
        arr.forEach((item, i) => {
          allItems.push({
            id: `${col.key}_${i}_${item.who}_${item.since || item.date || ''}`,
            ...item,
            category: item.category || col.key,
          })
        })
      })

      setItems(allItems)
      setLastFetched(new Date())
    } catch (err) {
      console.error('Gist fetch error:', err)
      setError('Could not load inbox — check connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchGist() }, [fetchGist])

  // Move is local-state only; resets on next sync (intentional)
  const handleMove = useCallback((itemId, newCategory) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, category: newCategory } : item
      )
    )
  }, [])

  const grouped = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map((c) => [c.key, []]))
    items.forEach((item) => {
      if (map[item.category]) map[item.category].push(item)
    })
    COLUMNS.forEach((c) => {
      map[c.key].sort((a, b) => {
        const da  = parseDate(a.since || a.date)?.getTime() ?? 0
        const db_ = parseDate(b.since || b.date)?.getTime() ?? 0
        return c.key === 'actioned' ? db_ - da : da - db_
      })
    })
    return map
  }, [items])

  const syncLabel = lastFetched
    ? `Last synced: ${lastFetched.toLocaleString('en-GB', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })}`
    : 'Never synced'

  return (
    <div className="inbox-page">
      <header className="inbox-page-header">
        <div className="inbox-page-header-inner">
          <h1 className="inbox-page-title">
            <Mail size={26} strokeWidth={1.75} />
            Inbox
          </h1>
          <div className="inbox-header-meta">
            <p className="inbox-page-sub mono">{syncLabel}</p>
            <button
              className="inbox-refresh-btn mono"
              onClick={fetchGist}
              disabled={loading}
              title="Refresh from Asi"
            >
              <RefreshCw size={13} className={loading ? 'inbox-spinning' : ''} />
              {loading ? 'Syncing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="inbox-error-banner">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div className="inbox-board">
        {COLUMNS.map((column) => (
          <InboxColumn
            key={column.key}
            column={column}
            items={grouped[column.key]}
            onMove={handleMove}
          />
        ))}
      </div>
    </div>
  )
}
