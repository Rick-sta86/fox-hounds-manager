import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import {
  Mail, AlertCircle, Clock, Edit3, Archive, CheckCircle2,
} from 'lucide-react'
import './Inbox.css'

const COLLECTION = 'email_items'
const STALE_DAYS = 7

const COLUMNS = [
  { key: 'needs_you',      label: 'Needs You',      icon: AlertCircle },
  { key: 'drafts',         label: 'Drafts',         icon: Edit3 },
  { key: 'awaiting_reply', label: 'Awaiting Reply', icon: Clock },
  { key: 'parked',         label: 'Parked',         icon: Archive },
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
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return parseDate(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatSyncTime(ts) {
  if (!ts?.toDate) return null
  return ts.toDate().toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// ── InboxCard ─────────────────────────────────────────────────────────────

function InboxCard({ item }) {
  const dateValue = item.since || item.date
  const days = daysAgo(dateValue)
  const isStale = item.category !== 'actioned' && days !== null && days > STALE_DAYS

  const moveTo = (e) => {
    const category = e.target.value
    if (category === item.category) return
    updateDoc(doc(db, COLLECTION, item.id), { category, updatedAt: serverTimestamp() })
  }

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
          onChange={moveTo}
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

function InboxColumn({ column, items }) {
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
          items.map((item) => <InboxCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}

// ── Inbox (page) ──────────────────────────────────────────────────────────

export default function Inbox() {
  const [items, setItems] = useState([])

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, COLLECTION),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('Inbox listener error:', err)
    )
    return () => unsub()
  }, [])

  const grouped = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map((c) => [c.key, []]))
    items.forEach((item) => {
      if (map[item.category]) map[item.category].push(item)
    })
    COLUMNS.forEach((c) => {
      map[c.key].sort((a, b) => {
        const da = parseDate(a.since || a.date)?.getTime() ?? 0
        const db_ = parseDate(b.since || b.date)?.getTime() ?? 0
        return c.key === 'actioned' ? db_ - da : da - db_
      })
    })
    return map
  }, [items])

  const lastSynced = useMemo(() => {
    let latest = null
    items.forEach((item) => {
      const ts = item.updatedAt
      if (ts?.toMillis && (!latest || ts.toMillis() > latest.toMillis())) latest = ts
    })
    return latest
  }, [items])

  return (
    <div className="inbox-page">
      <header className="inbox-page-header">
        <div className="inbox-page-header-inner">
          <h1 className="inbox-page-title">
            <Mail size={26} strokeWidth={1.75} />
            Inbox
          </h1>
          <p className="inbox-page-sub mono">
            {lastSynced ? `Last synced: ${formatSyncTime(lastSynced)}` : 'Never synced'}
          </p>
        </div>
      </header>

      <div className="inbox-board">
        {COLUMNS.map((column) => (
          <InboxColumn key={column.key} column={column} items={grouped[column.key]} />
        ))}
      </div>
    </div>
  )
}
