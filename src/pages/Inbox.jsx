import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Mail, AlertCircle, Clock, Edit3, Archive, CheckCircle2, RefreshCw, Send,
} from 'lucide-react'
import './Inbox.css'

const INBOX_API    = '/.netlify/functions/inbox-refresh'
// This secret is also stored in Netlify env — move to import.meta.env.VITE_INBOX_SECRET if the repo is public
const INBOX_SECRET = 'aaIMOVLXq4m3fK6zT9OZKeHDelrSJoybJeobySDF'

const COLUMNS = [
  { key: 'needs_you',      label: 'Needs You',      icon: AlertCircle  },
  { key: 'drafts',         label: 'Drafts',         icon: Edit3        },
  { key: 'awaiting_reply', label: 'Awaiting Reply', icon: Clock        },
  { key: 'parked',         label: 'Parked',         icon: Archive      },
  { key: 'actioned',       label: 'Actioned',       icon: CheckCircle2 },
]

// ── InboxCard ─────────────────────────────────────────────────────────────────

function InboxCard({ item, onMove }) {
  const [draftOpen, setDraftOpen] = useState(false)

  return (
    <div className={`inbox-card ${item.stale ? 'inbox-card--stale' : ''}`}>
      <div className="inbox-card-top">
        <span className="inbox-card-who">{item.who || 'Unknown'}</span>
        {item.stale && <AlertCircle size={13} className="inbox-stale-icon" />}
      </div>

      <p className="inbox-card-what">{item.what || ''}</p>

      {item.draft && (
        <div className="inbox-card-draft">
          {draftOpen ? (
            <>
              <p className="inbox-card-draft-body">{item.draft}</p>
              <button
                className="inbox-draft-toggle mono"
                onClick={() => setDraftOpen(false)}
              >
                hide draft
              </button>
            </>
          ) : (
            <button
              className="inbox-draft-toggle mono"
              onClick={() => setDraftOpen(true)}
            >
              <Send size={10} />
              view draft
            </button>
          )}
        </div>
      )}

      <div className="inbox-card-bottom">
        <span className="inbox-card-since mono">
          <Clock size={11} />
          {item.since || '—'}
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

// ── InboxColumn ───────────────────────────────────────────────────────────────

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

// ── Inbox (page) ──────────────────────────────────────────────────────────────

export default function Inbox() {
  const [items,       setItems]       = useState([])
  const [lastFetched, setLastFetched] = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  const fetchInbox = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(INBOX_API, {
        method:  'POST',
        headers: { 'x-inbox-secret': INBOX_SECRET },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()

      const allItems = (data.threads || []).map((t) => ({
        id:       t.thread_id,
        category: t.column,
        who:      t.who,
        what:     t.what,
        since:    t.since,
        stale:    t.stale,
        draft:    t.draft || null,
      }))

      setItems(allItems)
      setLastFetched(new Date())
    } catch (err) {
      console.error('Inbox fetch error:', err)
      setError(`Could not load inbox — ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchInbox() }, [fetchInbox])

  // Move is local-state only; resets on next refresh (intentional)
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
      const key = map[item.category] ? item.category : 'actioned'
      map[key].push(item)
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
              onClick={fetchInbox}
              disabled={loading}
              title="Fetch latest from Gmail and re-categorise with Claude"
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
