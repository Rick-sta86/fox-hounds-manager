import { useState, useEffect, useRef } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { Check, Trash2, Plus, X, Pencil } from 'lucide-react'
import './Meetings.css'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(timestamp) {
  if (!timestamp) return ''
  const now  = Date.now()
  const then = timestamp.toMillis?.() ?? Number(timestamp)
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  const hours = Math.floor(diff / 3600)
  if (hours < 24)  return `${hours}h ago`
  const days = Math.floor(diff / 86400)
  if (days === 1)  return 'yesterday'
  if (days < 7)    return `${days} days ago`
  if (days < 14)   return '1 week ago'
  return `${Math.floor(days / 7)} weeks ago`
}

// ─── Meeting definitions ──────────────────────────────────────────────────────

const MEETINGS = [
  { id: 'marketing', label: 'Marketing Meeting', cadence: 'Weekly' },
  { id: 'managers',  label: 'Managers Meeting',  cadence: 'Weekly' },
  { id: 'finance',   label: 'Finance Meeting',   cadence: 'Monthly' },
]

// ─── MeetingCard ──────────────────────────────────────────────────────────────

function MeetingCard({ meeting }) {
  const [notes, setNotes]                     = useState([])
  const [addText, setAddText]                 = useState('')
  const [showDone, setShowDone]               = useState(false)
  const [editingId, setEditingId]             = useState(null)
  const [editText, setEditText]               = useState('')
  const [addingSubNoteId, setAddingSubNoteId] = useState(null)
  const [subNoteText, setSubNoteText]         = useState('')
  const inputRef    = useRef(null)
  const editSavedRef = useRef(false)

  useEffect(() => {
    const q = query(
      collection(db, 'meeting_notes'),
      where('meetingId', '==', meeting.id)
    )
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0
        const bTime = b.createdAt?.toMillis?.() ?? 0
        return aTime - bTime
      })
      setNotes(docs)
    })
  }, [meeting.id])

  const handleAdd = async (e) => {
    e?.preventDefault()
    const trimmed = addText.trim()
    if (!trimmed) return
    await addDoc(collection(db, 'meeting_notes'), {
      meetingId: meeting.id,
      text: trimmed,
      discussed: false,
      createdAt: serverTimestamp(),
    })
    setAddText('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd()
  }

  const toggleDiscussed = (id, current) =>
    updateDoc(doc(db, 'meeting_notes', id), { discussed: !current })

  const handleDelete = (id) =>
    deleteDoc(doc(db, 'meeting_notes', id))

  const clearDiscussed = () => {
    notes.filter((n) => n.discussed).forEach((n) => deleteDoc(doc(db, 'meeting_notes', n.id)))
  }

  // ── Edit handlers ───────────────────────────────────────────────────────────

  const startEdit = (note) => {
    editSavedRef.current = false
    setEditingId(note.id)
    setEditText(note.text)
    setAddingSubNoteId(null)
  }

  const saveEdit = async () => {
    if (!editingId || editSavedRef.current) return
    editSavedRef.current = true
    const id = editingId
    const text = editText
    setEditingId(null)
    setEditText('')
    const trimmed = text.trim()
    if (trimmed) {
      await updateDoc(doc(db, 'meeting_notes', id), { text: trimmed })
    }
  }

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); saveEdit() }
    if (e.key === 'Escape') { setEditingId(null); setEditText('') }
  }

  // ── Sub-note handlers ───────────────────────────────────────────────────────

  const openSubNoteInput = (noteId) => {
    setAddingSubNoteId(noteId)
    setSubNoteText('')
    setEditingId(null)
  }

  const addSubNote = async (noteId, currentSubnotes) => {
    const trimmed = subNoteText.trim()
    setAddingSubNoteId(null)
    setSubNoteText('')
    if (!trimmed) return
    const newSubnote = { id: crypto.randomUUID(), text: trimmed }
    await updateDoc(doc(db, 'meeting_notes', noteId), {
      subnotes: [...(currentSubnotes || []), newSubnote],
    })
  }

  const deleteSubNote = async (noteId, currentSubnotes, subNoteId) => {
    await updateDoc(doc(db, 'meeting_notes', noteId), {
      subnotes: (currentSubnotes || []).filter((sn) => sn.id !== subNoteId),
    })
  }

  const pending   = notes.filter((n) => !n.discussed)
  const discussed = notes.filter((n) => n.discussed)
  const hasDone   = discussed.length > 0

  return (
    <div className="mt-card">
      {/* Card header */}
      <div className="mt-card-header">
        <div className="mt-card-header-left">
          <span className={`mt-cadence-badge ${meeting.cadence === 'Monthly' ? 'mt-cadence-badge--monthly' : ''}`}>
            {meeting.cadence}
          </span>
          <h2 className="mt-card-title">{meeting.label}</h2>
        </div>
        <div className="mt-card-header-right">
          {pending.length > 0 && (
            <span className="mt-note-count">{pending.length}</span>
          )}
          {hasDone && (
            <button
              className="mt-clear-btn"
              onClick={clearDiscussed}
              title="Remove all discussed items"
            >
              <X size={12} />
              <span>Clear discussed</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick-add input */}
      <div className="mt-add-row">
        <Plus size={13} className="mt-add-icon" />
        <input
          ref={inputRef}
          className="mt-add-input"
          placeholder="Add a note or agenda item…"
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {addText.trim() && (
          <button className="mt-add-submit" onClick={handleAdd}>Add</button>
        )}
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="mt-empty">No notes yet — add one above.</div>
      ) : (
        <div className="mt-notes-list">
          {/* Pending notes */}
          {pending.map((note) => (
            <div key={note.id} className="mt-note-row">
              <button
                className="mt-checkbox"
                onClick={() => toggleDiscussed(note.id, note.discussed)}
                title="Mark as discussed"
              />
              <div className="mt-note-body">
                {editingId === note.id ? (
                  <input
                    className="mt-edit-input"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={saveEdit}
                    autoFocus
                  />
                ) : (
                  <>
                    <span className="mt-note-text">{note.text}</span>
                    {note.createdAt && (
                      <span className="mt-note-time">{timeAgo(note.createdAt)}</span>
                    )}
                  </>
                )}

                {/* Sub-notes */}
                {note.subnotes?.length > 0 && (
                  <div className="mt-subnotes">
                    {note.subnotes.map((sn) => (
                      <div key={sn.id} className="mt-subnote-row">
                        <span className="mt-subnote-bullet">·</span>
                        <span className="mt-subnote-text">{sn.text}</span>
                        <button
                          className="mt-subnote-delete"
                          onClick={() => deleteSubNote(note.id, note.subnotes, sn.id)}
                          title="Delete sub-note"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add sub-note */}
                {addingSubNoteId === note.id ? (
                  <div className="mt-add-subnote-row">
                    <span className="mt-subnote-bullet">·</span>
                    <input
                      className="mt-subnote-input"
                      value={subNoteText}
                      onChange={(e) => setSubNoteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter')  { e.preventDefault(); addSubNote(note.id, note.subnotes) }
                        if (e.key === 'Escape') { setAddingSubNoteId(null); setSubNoteText('') }
                      }}
                      onBlur={() => { setAddingSubNoteId(null); setSubNoteText('') }}
                      placeholder="Sub-note…"
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    className="mt-add-subnote-btn"
                    onClick={() => openSubNoteInput(note.id)}
                  >
                    <Plus size={10} />
                    <span>sub-note</span>
                  </button>
                )}
              </div>

              {/* Note action buttons */}
              <div className="mt-note-actions">
                <button
                  className="mt-edit-btn"
                  onClick={() => startEdit(note)}
                  title="Edit note"
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="mt-delete-btn"
                  onClick={() => handleDelete(note.id)}
                  title="Delete note"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          {/* Discussed notes */}
          {hasDone && (
            <>
              <button
                className="mt-discussed-toggle"
                onClick={() => setShowDone((v) => !v)}
              >
                <Check size={11} />
                <span>{discussed.length} discussed</span>
                <span className="mt-discussed-toggle-caret">{showDone ? '▲' : '▼'}</span>
              </button>
              {showDone && discussed.map((note) => (
                <div key={note.id} className="mt-note-row mt-note-row--discussed">
                  <button
                    className="mt-checkbox mt-checkbox--checked"
                    onClick={() => toggleDiscussed(note.id, note.discussed)}
                    title="Mark as not discussed"
                  >
                    <Check size={9} strokeWidth={3} />
                  </button>
                  <span className="mt-note-text mt-note-text--discussed">{note.text}</span>
                  <button
                    className="mt-delete-btn"
                    onClick={() => handleDelete(note.id)}
                    title="Delete note"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Meetings page ────────────────────────────────────────────────────────────

export default function Meetings() {
  return (
    <div className="mt-page">
      <div className="mt-page-header">
        <div className="mt-page-header-inner">
          <h1 className="mt-page-title">Meetings</h1>
          <p className="mt-page-sub">Add notes and agenda items before each meeting.</p>
        </div>
      </div>

      <div className="mt-cards">
        {MEETINGS.map((meeting) => (
          <MeetingCard key={meeting.id} meeting={meeting} />
        ))}
      </div>
    </div>
  )
}
