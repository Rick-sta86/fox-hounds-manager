// Fox & Hounds Manager — Events (pub occasions: private hire, wine dinners, Newsells)

import { useState, useEffect, useRef } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, getDocs, doc,
  serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../firebase'
import {
  Plus, Check, Trash2, Pencil, X, Calendar,
  ArrowLeft, StickyNote, ListTodo, ChevronRight,
  Paperclip, Upload, FileText, Image as ImageIcon, File as FileIcon, Download,
} from 'lucide-react'
import './Events.css'

const COL = 'events'

const EVENT_TYPES = [
  { key: 'private_hire', label: 'Private Hire' },
  { key: 'wine_dinner',  label: 'Wine Dinner' },
  { key: 'newsells',     label: 'Newsells' },
  { key: 'other',        label: 'Other' },
]

const STATUSES = [
  { key: 'planning',  label: 'Planning' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'done',      label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
]

const FILTERS = [
  { key: 'planning',  label: 'Planning' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'done',      label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all',       label: 'All' },
]

// ─── Date helpers ──────────────────────────────────────────────────────────────

function parseDate(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d))
}

function isOverdue(dateStr) {
  if (!dateStr) return false
  const due = parseDate(dateStr)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return due < today
}

function isDueSoon(dateStr) {
  if (!dateStr) return false
  const due = parseDate(dateStr)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const soon = new Date(today); soon.setDate(today.getDate() + 2)
  return due >= today && due <= soon
}

function formatDueDate(dateStr) {
  if (!dateStr) return null
  const due = parseDate(dateStr)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (due.getTime() === today.getTime())    return 'today'
  if (due.getTime() === tomorrow.getTime()) return 'tomorrow'
  return due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatEventDate(dateStr) {
  if (!dateStr) return 'No date set'
  const date = parseDate(dateStr)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (date.getTime() === today.getTime())    return 'Today'
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow'
  const opts = { weekday: 'short', day: 'numeric', month: 'short' }
  if (date.getFullYear() !== today.getFullYear()) opts.year = 'numeric'
  return date.toLocaleDateString('en-GB', opts)
}

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

function formatNoteTime(timestamp) {
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
  const date = new Date(then)
  if (date.getFullYear() === new Date().getFullYear()) {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── EventTaskRow ─────────────────────────────────────────────────────────────

function EventTaskRow({ task, onToggle, onDelete, onUpdateTitle, onUpdateDueDate }) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(task.title)
  const editRef = useRef(null)
  const dateRef = useRef(null)

  useEffect(() => {
    if (editing) editRef.current?.focus()
  }, [editing])

  const commitEdit = () => {
    const trimmed = editVal.trim()
    if (trimmed && trimmed !== task.title) onUpdateTitle(task.id, trimmed)
    setEditing(false)
  }
  const cancelEdit = () => { setEditVal(task.title); setEditing(false) }
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') cancelEdit()
  }

  const handleDateChange = (e) => onUpdateDueDate(task.id, e.target.value || null)
  const handleCalendarClick = (e) => {
    e.stopPropagation()
    dateRef.current?.showPicker?.()
    dateRef.current?.focus()
  }

  const overdue   = !task.completed && isOverdue(task.dueDate)
  const dueSoon   = !task.completed && !overdue && isDueSoon(task.dueDate)
  const dateLabel = formatDueDate(task.dueDate)

  return (
    <div className={`ev-task-row ${task.completed ? 'ev-task-row--done' : ''}`}>
      <button
        className={`ev-checkbox ${task.completed ? 'ev-checkbox--checked' : ''}`}
        onClick={() => onToggle(task.id, task.completed)}
      >
        {task.completed && <Check size={11} strokeWidth={3} />}
      </button>

      {editing ? (
        <input
          ref={editRef}
          className="ev-task-edit"
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitEdit}
        />
      ) : (
        <span
          className="ev-task-title"
          onDoubleClick={() => !task.completed && setEditing(true)}
        >
          {task.title}
        </span>
      )}

      {dateLabel && (
        <span className={`ev-task-due ${overdue ? 'ev-task-due--overdue' : ''} ${dueSoon ? 'ev-task-due--soon' : ''}`}>
          {overdue && <span className="ev-task-due-dot" />}
          {dateLabel}
        </span>
      )}

      <div className="ev-task-actions">
        {!task.completed && (
          <>
            <button
              className={`ev-action ${task.dueDate ? 'ev-action--date-set' : ''}`}
              onClick={handleCalendarClick}
              title={task.dueDate ? 'Change due date' : 'Set due date'}
            >
              <Calendar size={13} />
            </button>
            <input
              ref={dateRef}
              type="date"
              className="ev-date-input-hidden"
              value={task.dueDate || ''}
              onChange={handleDateChange}
              tabIndex={-1}
            />
            <button className="ev-action" onClick={() => setEditing(true)} title="Edit">
              <Pencil size={13} />
            </button>
          </>
        )}
        <button className="ev-action ev-action--delete" onClick={() => onDelete(task.id)} title="Delete">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── EventFileRow ─────────────────────────────────────────────────────────────

function EventFileRow({ file, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isImage = file.type?.startsWith('image/')
  const isPdf   = file.type === 'application/pdf'
  const Icon    = isImage ? ImageIcon : isPdf ? FileText : FileIcon

  return (
    <div className="ev-file-row">
      {isImage ? (
        <img src={file.url} alt={file.name} className="ev-file-thumb" />
      ) : (
        <div className="ev-file-icon-wrap">
          <Icon size={16} />
        </div>
      )}

      <div className="ev-file-info">
        <span className="ev-file-name">{file.name}</span>
        <span className="ev-file-meta mono">
          {formatBytes(file.size)} · {timeAgo(file.uploadedAt)}
        </span>
      </div>

      <div className="ev-file-actions">
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ev-action ev-action--download"
          title="Open / Download"
        >
          <Download size={13} />
        </a>
        <button
          className="ev-action ev-action--delete"
          onClick={() => { if (!confirmDelete) { setConfirmDelete(true); return } onDelete() }}
          onBlur={() => setConfirmDelete(false)}
          title={confirmDelete ? 'Click again to confirm' : 'Delete file'}
        >
          {confirmDelete ? <X size={13} /> : <Trash2 size={13} />}
        </button>
      </div>
    </div>
  )
}

// ─── EventFilesTab ────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024

function EventFilesTab({ event }) {
  const [files, setFiles]             = useState([])
  const [uploadsInProgress, setUploadsInProgress] = useState(0)
  const [progress, setProgress]       = useState(0)
  const [uploadError, setUploadError] = useState(null)
  const [dragOver, setDragOver]       = useState(false)
  const fileInputRef   = useRef(null)
  const progressMapRef = useRef({})

  useEffect(() => {
    const q = query(collection(db, COL, event.id, 'files'), orderBy('uploadedAt', 'desc'))
    return onSnapshot(q, (snap) => setFiles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [event.id])

  const recalcProgress = () => {
    const vals = Object.values(progressMapRef.current)
    setProgress(vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0)
  }

  const uploadFile = (file) => {
    if (file.size > MAX_FILE_BYTES) {
      setUploadError(`"${file.name}" exceeds the 10 MB limit.`)
      return
    }
    setUploadError(null)

    const uid      = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path     = `events/${event.id}/${uid}-${safeName}`
    const sRef     = storageRef(storage, path)
    const task     = uploadBytesResumable(sRef, file, { contentType: file.type })

    progressMapRef.current[uid] = 0
    setUploadsInProgress((n) => n + 1)

    task.on('state_changed',
      (snap) => {
        progressMapRef.current[uid] = Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
        recalcProgress()
      },
      (err) => {
        console.error(err)
        delete progressMapRef.current[uid]
        setUploadError('Upload failed — please try again.')
        setUploadsInProgress((n) => n - 1)
        recalcProgress()
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref)
        await addDoc(collection(db, COL, event.id, 'files'), {
          name: file.name, url, type: file.type, size: file.size,
          storagePath: path, uploadedAt: serverTimestamp(),
        })
        await updateDoc(doc(db, COL, event.id), { updatedAt: serverTimestamp() })
        delete progressMapRef.current[uid]
        setUploadsInProgress((n) => n - 1)
        recalcProgress()
      }
    )
  }

  const handleFiles = (fileList) => Array.from(fileList || []).forEach((f) => uploadFile(f))

  const handleInputChange = (e) => {
    handleFiles(e.target.files)
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleDeleteFile = async (fileDoc) => {
    if (fileDoc.storagePath) {
      try { await deleteObject(storageRef(storage, fileDoc.storagePath)) } catch {}
    }
    await deleteDoc(doc(db, COL, event.id, 'files', fileDoc.id))
  }

  return (
    <div className="ev-files-tab">
      <div
        className={`ev-upload-zone ${dragOver ? 'ev-upload-zone--over' : ''} ${uploadsInProgress > 0 ? 'ev-upload-zone--busy' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" multiple className="ev-file-input" onChange={handleInputChange} />
        {uploadsInProgress > 0 ? (
          <div className="ev-upload-progress-wrap">
            <div className="ev-upload-bar-track">
              <div className="ev-upload-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="ev-upload-pct mono">
              {uploadsInProgress > 1 ? `${uploadsInProgress} files · ` : ''}{progress}%
            </span>
          </div>
        ) : (
          <>
            <Upload size={16} className="ev-upload-icon" />
            <span className="ev-upload-hint">Click to upload or drop files here</span>
            <span className="ev-upload-hint-sub">PDFs, images, and more · Max 10 MB each</span>
          </>
        )}
      </div>

      {uploadError && <div className="ev-upload-error">{uploadError}</div>}

      {files.length === 0 && uploadsInProgress === 0 ? (
        <div className="ev-section-empty">No files attached yet.</div>
      ) : (
        <div className="ev-file-list">
          {files.map((f) => (
            <EventFileRow key={f.id} file={f} onDelete={() => handleDeleteFile(f)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── EventDetailView ──────────────────────────────────────────────────────────

function EventDetailView({ event, initialTab, onBack, onUpdateTitle, onUpdateType, onUpdateStatus, onUpdateEventDate, onDelete }) {
  const [tab, setTab]           = useState(initialTab || 'notes')
  const [notes, setNotes]       = useState([])
  const [tasks, setTasks]       = useState([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState(event.title)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [noteText,    setNoteText]    = useState('')
  const [taskTitle,   setTaskTitle]   = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')

  const titleRef = useRef(null)
  const eventDateRef = useRef(null)

  useEffect(() => { if (editingTitle) titleRef.current?.focus() }, [editingTitle])

  useEffect(() => {
    const q = query(collection(db, COL, event.id, 'notes'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [event.id])

  useEffect(() => {
    const q = query(collection(db, COL, event.id, 'tasks'), orderBy('createdAt', 'asc'))
    return onSnapshot(q, (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [event.id])

  const touchEvent = () => updateDoc(doc(db, COL, event.id), { updatedAt: serverTimestamp() })

  // ── Title ──────────────────────────────────────────────────────────────────
  const commitTitle = () => {
    const trimmed = titleVal.trim()
    if (trimmed && trimmed !== event.title) onUpdateTitle(event.id, trimmed)
    else setTitleVal(event.title)
    setEditingTitle(false)
  }
  const cancelTitle = () => { setTitleVal(event.title); setEditingTitle(false) }

  // ── Notes ──────────────────────────────────────────────────────────────────
  const handleAddNote = async (e) => {
    e.preventDefault()
    const trimmed = noteText.trim()
    if (!trimmed) return
    await addDoc(collection(db, COL, event.id, 'notes'), { text: trimmed, createdAt: serverTimestamp() })
    await touchEvent()
    setNoteText('')
  }
  const handleDeleteNote = (id) => deleteDoc(doc(db, COL, event.id, 'notes', id))

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const handleAddTask = async (e) => {
    e.preventDefault()
    const trimmed = taskTitle.trim()
    if (!trimmed || !taskDueDate) return
    await addDoc(collection(db, COL, event.id, 'tasks'), {
      title: trimmed, dueDate: taskDueDate, completed: false, createdAt: serverTimestamp(),
    })
    await touchEvent()
    setTaskTitle('')
    setTaskDueDate('')
  }
  const handleToggleTask      = (id, current) => updateDoc(doc(db, COL, event.id, 'tasks', id), { completed: !current })
  const handleDeleteTask      = (id)          => deleteDoc(doc(db, COL, event.id, 'tasks', id))
  const handleUpdateTaskTitle  = (id, title)   => updateDoc(doc(db, COL, event.id, 'tasks', id), { title })
  const handleUpdateTaskDueDate = (id, dueDate) => updateDoc(doc(db, COL, event.id, 'tasks', id), { dueDate: dueDate ?? null })

  // ── Delete event ────────────────────────────────────────────────────────────
  const handleDeleteEvent = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    onDelete(event.id)
  }

  const pendingTasks = tasks.filter((t) => !t.completed)
  const doneTasks    = tasks.filter((t) => t.completed)
  const sortedPending = [...pendingTasks].sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    if (a.dueDate) return -1
    if (b.dueDate) return 1
    return 0
  })
  const sortedTasks = [...sortedPending, ...doneTasks]

  return (
    <div className="ev-page">
      <header className="ev-detail-header">
        <button className="ev-back-btn" onClick={onBack} title="Back to events">
          <ArrowLeft size={16} />
        </button>

        <div className="ev-detail-header-main">
          {editingTitle ? (
            <input
              ref={titleRef}
              className="ev-title-edit"
              value={titleVal}
              onChange={(e) => setTitleVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') cancelTitle() }}
              onBlur={commitTitle}
            />
          ) : (
            <h1 className="ev-detail-title" onDoubleClick={() => setEditingTitle(true)}>
              {event.title}
              <button className="ev-title-edit-btn" onClick={() => setEditingTitle(true)} title="Rename">
                <Pencil size={13} />
              </button>
            </h1>
          )}

          <div className="ev-detail-meta">
            {/* Event date */}
            <div className="ev-date-wrapper">
              <Calendar size={13} className="ev-meta-icon" />
              <button
                className="ev-date-btn"
                onClick={() => eventDateRef.current?.showPicker?.()}
                title="Change event date"
              >
                {formatEventDate(event.eventDate)}
              </button>
              <input
                ref={eventDateRef}
                type="date"
                className="ev-date-input-hidden"
                value={event.eventDate || ''}
                onChange={(e) => onUpdateEventDate(event.id, e.target.value || null)}
                tabIndex={-1}
              />
            </div>

            {/* Type pills */}
            <div className="ev-type-group">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t.key}
                  className={`ev-type-pill ev-type-pill--${t.key} ${event.type === t.key ? 'ev-type-pill--selected' : ''}`}
                  onClick={() => onUpdateType(event.id, t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Status pills */}
            <div className="ev-status-group">
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  className={`ev-status-pill ev-status-pill--${s.key} ${event.status === s.key ? 'ev-status-pill--selected' : ''}`}
                  onClick={() => onUpdateStatus(event.id, s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          className={`ev-delete-btn ${confirmDelete ? 'ev-delete-btn--confirm' : ''}`}
          onClick={handleDeleteEvent}
          onBlur={() => setConfirmDelete(false)}
        >
          <Trash2 size={14} />
          {confirmDelete ? 'Confirm delete?' : 'Delete'}
        </button>
      </header>

      <div className="ev-tabs">
        <button className={`ev-tab ${tab === 'notes' ? 'ev-tab--active' : ''}`} onClick={() => setTab('notes')}>
          <StickyNote size={14} /> Notes
        </button>
        <button className={`ev-tab ${tab === 'tasks' ? 'ev-tab--active' : ''}`} onClick={() => setTab('tasks')}>
          <ListTodo size={14} /> Tasks
          {pendingTasks.length > 0 && <span className="ev-tab-count mono">{pendingTasks.length}</span>}
        </button>
        <button className={`ev-tab ${tab === 'files' ? 'ev-tab--active' : ''}`} onClick={() => setTab('files')}>
          <Paperclip size={14} /> Files
        </button>
      </div>

      {tab === 'notes' && (
        <div className="ev-notes-tab">
          <section className="ev-section">
            <div className="ev-section-header">
              <StickyNote size={14} className="ev-section-icon" />
              <h2 className="ev-section-title">Notes &amp; Updates</h2>
            </div>

            <form className="ev-add-note-form" onSubmit={handleAddNote}>
              <textarea
                className="ev-add-note-textarea"
                placeholder="Log a note or update…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
              />
              {noteText.trim() && (
                <button type="submit" className="ev-add-submit ev-add-submit--note">Post update</button>
              )}
            </form>

            {notes.length === 0 && <div className="ev-section-empty">No notes logged yet.</div>}

            {notes.length > 0 && (
              <div className="ev-notes-list">
                {notes.map((note) => (
                  <div key={note.id} className="ev-note-row">
                    <div className="ev-note-body">
                      <span className="ev-note-text">{note.text}</span>
                      <span className="ev-note-time mono">{formatNoteTime(note.createdAt)}</span>
                    </div>
                    <button className="ev-action ev-action--delete" onClick={() => handleDeleteNote(note.id)} title="Delete note">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'files' && <EventFilesTab event={event} />}

      {tab === 'tasks' && (
        <div className="ev-tasks-tab">
          <form className="ev-add-task-form" onSubmit={handleAddTask}>
            <Plus size={14} className="ev-add-icon" />
            <input
              className="ev-add-task-input"
              placeholder="Task title…"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />
            <input
              type="date"
              className="ev-add-task-date"
              value={taskDueDate}
              onChange={(e) => setTaskDueDate(e.target.value)}
              title="Due date (required)"
            />
            {taskTitle.trim() && taskDueDate && (
              <button type="submit" className="ev-add-submit">Add</button>
            )}
          </form>

          {sortedTasks.length === 0 ? (
            <div className="ev-section-empty ev-section-empty--tasks">
              No tasks yet — add one above. Both a title and due date are required.
            </div>
          ) : (
            <div className="ev-task-list">
              {sortedTasks.map((task) => (
                <EventTaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggleTask}
                  onDelete={handleDeleteTask}
                  onUpdateTitle={handleUpdateTaskTitle}
                  onUpdateDueDate={handleUpdateTaskDueDate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── EventCard ────────────────────────────────────────────────────────────────

function EventCard({ event, onOpen }) {
  const typeInfo   = EVENT_TYPES.find((t) => t.key === event.type) || EVENT_TYPES[EVENT_TYPES.length - 1]
  const statusInfo = STATUSES.find((s) => s.key === event.status) || STATUSES[0]

  return (
    <button className="ev-card" onClick={() => onOpen(event.id)}>
      <div className="ev-card-top">
        <h3 className="ev-card-title">{event.title}</h3>
        <span className={`ev-type-badge ev-type-badge--${event.type || 'other'}`}>{typeInfo.label}</span>
      </div>
      <div className="ev-card-bottom">
        <div className="ev-card-meta">
          <Calendar size={12} className="ev-card-meta-icon" />
          <span className="ev-card-date mono">{formatEventDate(event.eventDate)}</span>
        </div>
        <div className="ev-card-right">
          <span className={`ev-status-badge ev-status-badge--${event.status || 'planning'}`}>{statusInfo.label}</span>
          <ChevronRight size={15} className="ev-card-chevron" />
        </div>
      </div>
    </button>
  )
}

// ─── EventsListView ───────────────────────────────────────────────────────────

function EventsListView({ events, filter, onFilterChange, onOpen, onAdd }) {
  const [addTitle, setAddTitle] = useState('')
  const [addDate,  setAddDate]  = useState('')
  const [addType,  setAddType]  = useState('other')
  const addRef = useRef(null)

  const filtered = filter === 'all' ? events : events.filter((e) => e.status === filter)
  const sorted = [...filtered].sort((a, b) => {
    if (a.eventDate && b.eventDate) return a.eventDate.localeCompare(b.eventDate)
    if (a.eventDate) return -1
    if (b.eventDate) return 1
    return 0
  })

  const handleAdd = async (e) => {
    e.preventDefault()
    const trimmed = addTitle.trim()
    if (!trimmed || !addDate) return
    await onAdd(trimmed, addDate, addType)
    setAddTitle('')
    setAddDate('')
    addRef.current?.focus()
  }

  const filterLabel = FILTERS.find((f) => f.key === filter)?.label.toLowerCase()

  return (
    <div className="ev-page">
      <header className="ev-page-header">
        <div className="ev-page-header-inner">
          <h1 className="ev-page-title">Events</h1>
          <p className="ev-page-sub">Private hires, wine dinners, Newsells events &amp; more.</p>
        </div>
      </header>

      <div className="ev-controls">
        <div className="ev-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`ev-filter ${filter === f.key ? 'ev-filter--active' : ''}`}
              onClick={() => onFilterChange(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <form className="ev-add-form" onSubmit={handleAdd}>
          <Plus size={15} className="ev-add-icon" />
          <input
            ref={addRef}
            className="ev-add-input"
            placeholder="Event title…"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
          />
          <input
            type="date"
            className="ev-add-date"
            value={addDate}
            onChange={(e) => setAddDate(e.target.value)}
            title="Event date"
          />
          <select
            className="ev-add-type"
            value={addType}
            onChange={(e) => setAddType(e.target.value)}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          {addTitle.trim() && addDate && (
            <button type="submit" className="ev-add-submit">Create</button>
          )}
        </form>
      </div>

      {sorted.length === 0 ? (
        <div className="ev-empty">
          No {filter !== 'all' ? filterLabel + ' ' : ''}events yet.
        </div>
      ) : (
        <div className="ev-grid">
          {sorted.map((e) => <EventCard key={e.id} event={e} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  )
}

// ─── Events (page) ────────────────────────────────────────────────────────────

export default function Events({ eventFocus, onClearEventFocus }) {
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('planning')
  const [openId, setOpenId]   = useState(eventFocus?.id || null)
  const [focusTab, setFocusTab] = useState(eventFocus?.tab || null)

  useEffect(() => {
    const q = query(collection(db, COL), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (eventFocus?.id) {
      setOpenId(eventFocus.id)
      setFocusTab(eventFocus.tab || 'notes')
      onClearEventFocus?.()
    }
  }, [eventFocus, onClearEventFocus])

  const handleOpen = (id) => { setOpenId(id); setFocusTab(null) }
  const handleBack = () => { setOpenId(null); setFocusTab(null) }

  const handleAddEvent = async (title, eventDate, type) => {
    await addDoc(collection(db, COL), {
      title, eventDate, type, status: 'planning',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
  }

  const handleUpdateTitle     = (id, title)     => updateDoc(doc(db, COL, id), { title, updatedAt: serverTimestamp() })
  const handleUpdateType      = (id, type)      => updateDoc(doc(db, COL, id), { type, updatedAt: serverTimestamp() })
  const handleUpdateStatus    = (id, status)    => updateDoc(doc(db, COL, id), { status, updatedAt: serverTimestamp() })
  const handleUpdateEventDate = (id, eventDate) => updateDoc(doc(db, COL, id), { eventDate: eventDate ?? null, updatedAt: serverTimestamp() })

  const handleDeleteEvent = async (id) => {
    const batch = writeBatch(db)
    for (const sub of ['notes', 'tasks']) {
      const snap = await getDocs(collection(db, COL, id, sub))
      snap.forEach((d) => batch.delete(d.ref))
    }
    const filesSnap = await getDocs(collection(db, COL, id, 'files'))
    filesSnap.forEach((d) => batch.delete(d.ref))
    batch.delete(doc(db, COL, id))
    await batch.commit()
    filesSnap.forEach(async (d) => {
      const path = d.data().storagePath
      if (path) try { await deleteObject(storageRef(storage, path)) } catch {}
    })
    setOpenId(null)
  }

  if (loading) {
    return (
      <div className="ev-state">
        <span className="ev-spinner" />
        Loading events…
      </div>
    )
  }

  const openEvent = events.find((e) => e.id === openId)

  if (openEvent) {
    return (
      <EventDetailView
        key={openEvent.id}
        event={openEvent}
        initialTab={focusTab || 'notes'}
        onBack={handleBack}
        onUpdateTitle={handleUpdateTitle}
        onUpdateType={handleUpdateType}
        onUpdateStatus={handleUpdateStatus}
        onUpdateEventDate={handleUpdateEventDate}
        onDelete={handleDeleteEvent}
      />
    )
  }

  return (
    <EventsListView
      events={events}
      filter={filter}
      onFilterChange={setFilter}
      onOpen={handleOpen}
      onAdd={handleAddEvent}
    />
  )
}
