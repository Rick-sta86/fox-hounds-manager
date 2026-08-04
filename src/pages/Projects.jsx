// Fox & Hounds Manager — Projects (operational & creative projects)

import { useState, useEffect, useRef } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, getDocs, doc,
  serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../firebase'
import {
  Plus, Check, Trash2, Pencil, X, Save, Calendar,
  ArrowLeft, Link2, ExternalLink, StickyNote, ListTodo, ChevronRight,
  Paperclip, Upload, FileText, Image as ImageIcon, File as FileIcon, Download,
} from 'lucide-react'
import './Projects.css'

const COL = 'projects'

const STATUSES = [
  { key: 'active',    label: 'Active' },
  { key: 'onhold',    label: 'On Hold' },
  { key: 'completed', label: 'Completed' },
]

const FILTERS = [
  { key: 'active',    label: 'Active' },
  { key: 'onhold',    label: 'On Hold' },
  { key: 'completed', label: 'Completed' },
  { key: 'all',       label: 'All' },
]

// ─── Date helpers ─────────────────────────────────────────────────────────────

function isOverdue(dateStr) {
  if (!dateStr) return false
  const [y, m, d] = dateStr.split('-')
  const due = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return due < today
}

function isDueSoon(dateStr) {
  if (!dateStr) return false
  const [y, m, d] = dateStr.split('-')
  const due = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const soon = new Date(today); soon.setDate(today.getDate() + 2)
  return due >= today && due <= soon
}

function formatDueDate(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-')
  const due = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (due.getTime() === today.getTime())    return 'today'
  if (due.getTime() === tomorrow.getTime()) return 'tomorrow'
  return due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
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
  if (bytes < 1024)           return `${bytes} B`
  if (bytes < 1024 * 1024)    return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── ProjectTaskRow ───────────────────────────────────────────────────────────

function ProjectTaskRow({ task, onToggle, onDelete, onUpdateTitle, onUpdateDueDate }) {
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
    <div className={`pr-task-row ${task.completed ? 'pr-task-row--done' : ''}`}>
      <button
        className={`pr-checkbox ${task.completed ? 'pr-checkbox--checked' : ''}`}
        onClick={() => onToggle(task.id, task.completed)}
      >
        {task.completed && <Check size={11} strokeWidth={3} />}
      </button>

      {editing ? (
        <input
          ref={editRef}
          className="pr-task-edit"
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitEdit}
        />
      ) : (
        <span
          className="pr-task-title"
          onDoubleClick={() => !task.completed && setEditing(true)}
        >
          {task.title}
        </span>
      )}

      {dateLabel && (
        <span className={`pr-task-due ${overdue ? 'pr-task-due--overdue' : ''} ${dueSoon ? 'pr-task-due--soon' : ''}`}>
          {overdue && <span className="pr-task-due-dot" />}
          {dateLabel}
        </span>
      )}

      <div className="pr-task-actions">
        {!task.completed && (
          <>
            <button
              className={`pr-action ${task.dueDate ? 'pr-action--date-set' : ''}`}
              onClick={handleCalendarClick}
              title={task.dueDate ? 'Change due date' : 'Set due date'}
            >
              <Calendar size={13} />
            </button>
            <input
              ref={dateRef}
              type="date"
              className="pr-date-input"
              value={task.dueDate || ''}
              onChange={handleDateChange}
              tabIndex={-1}
            />
            <button className="pr-action" onClick={() => setEditing(true)} title="Edit">
              <Pencil size={13} />
            </button>
          </>
        )}
        <button className="pr-action pr-action--delete" onClick={() => onDelete(task.id)} title="Delete">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── FileRow ──────────────────────────────────────────────────────────────────

function FileRow({ file, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isImage = file.type?.startsWith('image/')
  const isPdf   = file.type === 'application/pdf'
  const Icon    = isImage ? ImageIcon : isPdf ? FileText : FileIcon

  return (
    <div className="pr-file-row">
      {isImage ? (
        <img src={file.url} alt={file.name} className="pr-file-thumb" />
      ) : (
        <div className="pr-file-icon-wrap">
          <Icon size={16} />
        </div>
      )}

      <div className="pr-file-info">
        <span className="pr-file-name">{file.name}</span>
        <span className="pr-file-meta mono">
          {formatBytes(file.size)} · {timeAgo(file.uploadedAt)}
        </span>
      </div>

      <div className="pr-file-actions">
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="pr-action pr-action--download"
          title="Open / Download"
        >
          <Download size={13} />
        </a>
        <button
          className="pr-action pr-action--delete"
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

// ─── ProjectFilesTab ──────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024

function ProjectFilesTab({ project }) {
  const [files, setFiles]           = useState([])
  const [uploadsInProgress, setUploadsInProgress] = useState(0)
  const [progress, setProgress]     = useState(0)
  const [uploadError, setUploadError] = useState(null)
  const [dragOver, setDragOver]     = useState(false)
  const fileInputRef   = useRef(null)
  const progressMapRef = useRef({})

  useEffect(() => {
    const q = query(collection(db, COL, project.id, 'files'), orderBy('uploadedAt', 'desc'))
    return onSnapshot(q, (snap) => setFiles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [project.id])

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
    const path     = `projects/${project.id}/${uid}-${safeName}`
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
        console.error('Storage upload error:', err.code, err)
        delete progressMapRef.current[uid]
        setUploadError(`Upload failed (${err.code || err.message}) — please try again.`)
        setUploadsInProgress((n) => n - 1)
        recalcProgress()
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref)
        await addDoc(collection(db, COL, project.id, 'files'), {
          name: file.name, url, type: file.type, size: file.size,
          storagePath: path, uploadedAt: serverTimestamp(),
        })
        await updateDoc(doc(db, COL, project.id), { updatedAt: serverTimestamp() })
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
    await deleteDoc(doc(db, COL, project.id, 'files', fileDoc.id))
  }

  return (
    <div className="pr-files-tab">
      <div
        className={`pr-upload-zone ${dragOver ? 'pr-upload-zone--over' : ''} ${uploadsInProgress > 0 ? 'pr-upload-zone--busy' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" multiple className="pr-file-input" onChange={handleInputChange} />
        {uploadsInProgress > 0 ? (
          <div className="pr-upload-progress-wrap">
            <div className="pr-upload-bar-track">
              <div className="pr-upload-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="pr-upload-pct mono">
              {uploadsInProgress > 1 ? `${uploadsInProgress} files · ` : ''}{progress}%
            </span>
          </div>
        ) : (
          <>
            <Upload size={16} className="pr-upload-icon" />
            <span className="pr-upload-hint">Click to upload or drop files here</span>
            <span className="pr-upload-hint-sub">PDFs, images, and more · Max 10 MB each</span>
          </>
        )}
      </div>

      {uploadError && <div className="pr-upload-error">{uploadError}</div>}

      {files.length === 0 && !uploading ? (
        <div className="pr-section-empty">No files attached yet.</div>
      ) : (
        <div className="pr-file-list">
          {files.map((f) => (
            <FileRow key={f.id} file={f} onDelete={() => handleDeleteFile(f)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ProjectDetailView ────────────────────────────────────────────────────────

function ProjectDetailView({ project, initialTab, onBack, onUpdateTitle, onUpdateStatus, onDelete }) {
  const [tab, setTab]               = useState(initialTab)
  const [notes, setNotes]           = useState([])
  const [links, setLinks]           = useState([])
  const [tasks, setTasks]           = useState([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal]     = useState(project.title)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [noteText, setNoteText]   = useState('')
  const [linkUrl, setLinkUrl]     = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [taskTitle, setTaskTitle] = useState('')

  const titleRef = useRef(null)

  useEffect(() => { if (editingTitle) titleRef.current?.focus() }, [editingTitle])

  useEffect(() => {
    const q = query(collection(db, COL, project.id, 'notes'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [project.id])

  useEffect(() => {
    const q = query(collection(db, COL, project.id, 'links'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => setLinks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [project.id])

  useEffect(() => {
    const q = query(collection(db, COL, project.id, 'tasks'), orderBy('createdAt', 'asc'))
    return onSnapshot(q, (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [project.id])

  const touchProject = () => updateDoc(doc(db, COL, project.id), { updatedAt: serverTimestamp() })

  // ── Title ──────────────────────────────────────────────────────────────
  const commitTitle = () => {
    const trimmed = titleVal.trim()
    if (trimmed && trimmed !== project.title) onUpdateTitle(project.id, trimmed)
    else setTitleVal(project.title)
    setEditingTitle(false)
  }
  const cancelTitle = () => { setTitleVal(project.title); setEditingTitle(false) }

  // ── Notes ──────────────────────────────────────────────────────────────
  const handleAddNote = async (e) => {
    e.preventDefault()
    const trimmed = noteText.trim()
    if (!trimmed) return
    await addDoc(collection(db, COL, project.id, 'notes'), { text: trimmed, createdAt: serverTimestamp() })
    await touchProject()
    setNoteText('')
  }
  const handleDeleteNote = (id) => deleteDoc(doc(db, COL, project.id, 'notes', id))

  // ── Links ──────────────────────────────────────────────────────────────
  const handleAddLink = async (e) => {
    e.preventDefault()
    let url = linkUrl.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    await addDoc(collection(db, COL, project.id, 'links'), {
      url, label: linkLabel.trim() || null, createdAt: serverTimestamp(),
    })
    await touchProject()
    setLinkUrl(''); setLinkLabel('')
  }
  const handleDeleteLink = (id) => deleteDoc(doc(db, COL, project.id, 'links', id))

  // ── Tasks ──────────────────────────────────────────────────────────────
  const handleAddTask = async (e) => {
    e.preventDefault()
    const trimmed = taskTitle.trim()
    if (!trimmed) return
    await addDoc(collection(db, COL, project.id, 'tasks'), {
      title: trimmed, dueDate: null, completed: false, createdAt: serverTimestamp(),
    })
    await touchProject()
    setTaskTitle('')
  }
  const handleToggleTask     = (id, current) => updateDoc(doc(db, COL, project.id, 'tasks', id), { completed: !current })
  const handleDeleteTask     = (id) => deleteDoc(doc(db, COL, project.id, 'tasks', id))
  const handleUpdateTaskTitle = (id, title) => updateDoc(doc(db, COL, project.id, 'tasks', id), { title })
  const handleUpdateTaskDueDate = (id, dueDate) => updateDoc(doc(db, COL, project.id, 'tasks', id), { dueDate: dueDate ?? null })

  // ── Delete project ────────────────────────────────────────────────────
  const handleDeleteProject = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    onDelete(project.id)
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
    <div className="pr-page">
      <header className="pr-detail-header">
        <button className="pr-back-btn" onClick={onBack} title="Back to projects">
          <ArrowLeft size={16} />
        </button>

        <div className="pr-detail-header-main">
          {editingTitle ? (
            <input
              ref={titleRef}
              className="pr-title-edit"
              value={titleVal}
              onChange={(e) => setTitleVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') cancelTitle() }}
              onBlur={commitTitle}
            />
          ) : (
            <h1 className="pr-detail-title" onDoubleClick={() => setEditingTitle(true)}>
              {project.title}
              <button className="pr-title-edit-btn" onClick={() => setEditingTitle(true)} title="Rename">
                <Pencil size={13} />
              </button>
            </h1>
          )}

          <div className="pr-status-group">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                className={`pr-status-pill pr-status-pill--${s.key} ${project.status === s.key ? 'pr-status-pill--selected' : ''}`}
                onClick={() => onUpdateStatus(project.id, s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className={`pr-delete-btn ${confirmDelete ? 'pr-delete-btn--confirm' : ''}`}
          onClick={handleDeleteProject}
          onBlur={() => setConfirmDelete(false)}
        >
          <Trash2 size={14} />
          {confirmDelete ? 'Confirm delete?' : 'Delete'}
        </button>
      </header>

      <div className="pr-tabs">
        <button className={`pr-tab ${tab === 'overview' ? 'pr-tab--active' : ''}`} onClick={() => setTab('overview')}>
          <StickyNote size={14} /> Overview
        </button>
        <button className={`pr-tab ${tab === 'tasks' ? 'pr-tab--active' : ''}`} onClick={() => setTab('tasks')}>
          <ListTodo size={14} /> Tasks
          {pendingTasks.length > 0 && <span className="pr-tab-count mono">{pendingTasks.length}</span>}
        </button>
        <button className={`pr-tab ${tab === 'files' ? 'pr-tab--active' : ''}`} onClick={() => setTab('files')}>
          <Paperclip size={14} /> Files
        </button>
      </div>

      {tab === 'overview' && (
        <div className="pr-overview">
          {/* Links */}
          <section className="pr-section">
            <div className="pr-section-header">
              <Link2 size={14} className="pr-section-icon" />
              <h2 className="pr-section-title">Links</h2>
            </div>

            {links.length === 0 && <div className="pr-section-empty">No links added yet.</div>}

            {links.length > 0 && (
              <div className="pr-links-list">
                {links.map((link) => (
                  <div key={link.id} className="pr-link-row">
                    <a className="pr-link-anchor" href={link.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={12} />
                      <span>{link.label || link.url}</span>
                    </a>
                    <button className="pr-action pr-action--delete" onClick={() => handleDeleteLink(link.id)} title="Remove link">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form className="pr-add-link-form" onSubmit={handleAddLink}>
              <input
                className="pr-add-link-input"
                placeholder="https://…"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
              <input
                className="pr-add-link-input pr-add-link-input--label"
                placeholder="Label (optional)"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
              />
              {linkUrl.trim() && <button type="submit" className="pr-add-submit">Add</button>}
            </form>
          </section>

          {/* Notes */}
          <section className="pr-section">
            <div className="pr-section-header">
              <StickyNote size={14} className="pr-section-icon" />
              <h2 className="pr-section-title">Notes &amp; Updates</h2>
            </div>

            <form className="pr-add-note-form" onSubmit={handleAddNote}>
              <textarea
                className="pr-add-note-textarea"
                placeholder="Log a progress update…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
              />
              {noteText.trim() && <button type="submit" className="pr-add-submit pr-add-submit--note">Post update</button>}
            </form>

            {notes.length === 0 && <div className="pr-section-empty">No updates logged yet.</div>}

            {notes.length > 0 && (
              <div className="pr-notes-list">
                {notes.map((note) => (
                  <div key={note.id} className="pr-note-row">
                    <div className="pr-note-body">
                      <span className="pr-note-text">{note.text}</span>
                      <span className="pr-note-time mono">{formatNoteTime(note.createdAt)}</span>
                    </div>
                    <button className="pr-action pr-action--delete" onClick={() => handleDeleteNote(note.id)} title="Delete update">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'files' && <ProjectFilesTab project={project} />}

      {tab === 'tasks' && (
        <div className="pr-tasks-tab">
          <form className="pr-add-task-form" onSubmit={handleAddTask}>
            <Plus size={14} className="pr-add-icon" />
            <input
              className="pr-add-task-input"
              placeholder="Add a task…"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />
            {taskTitle.trim() && <button type="submit" className="pr-add-submit">Add</button>}
          </form>

          {sortedTasks.length === 0 ? (
            <div className="pr-section-empty pr-section-empty--tasks">No tasks yet — add one above.</div>
          ) : (
            <div className="pr-task-list">
              {sortedTasks.map((task) => (
                <ProjectTaskRow
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

// ─── ProjectCard ──────────────────────────────────────────────────────────────

function ProjectCard({ project, onOpen }) {
  const statusInfo = STATUSES.find((s) => s.key === project.status) || STATUSES[0]
  return (
    <button className="pr-card" onClick={() => onOpen(project.id)}>
      <div className="pr-card-top">
        <h3 className="pr-card-title">{project.title}</h3>
        <span className={`pr-status-badge pr-status-badge--${project.status}`}>{statusInfo.label}</span>
      </div>
      <div className="pr-card-bottom">
        <span className="pr-card-updated mono">Updated {timeAgo(project.updatedAt)}</span>
        <ChevronRight size={15} className="pr-card-chevron" />
      </div>
    </button>
  )
}

// ─── ProjectsListView ─────────────────────────────────────────────────────────

function ProjectsListView({ projects, filter, onFilterChange, onOpen, onAdd }) {
  const [addTitle, setAddTitle] = useState('')
  const addRef = useRef(null)

  const filtered = filter === 'all' ? projects : projects.filter((p) => p.status === filter)
  const sorted = [...filtered].sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))

  const handleAdd = async (e) => {
    e.preventDefault()
    const trimmed = addTitle.trim()
    if (!trimmed) return
    await onAdd(trimmed)
    setAddTitle('')
    addRef.current?.focus()
  }

  const filterLabel = FILTERS.find((f) => f.key === filter)?.label.toLowerCase()

  return (
    <div className="pr-page">
      <header className="pr-page-header">
        <div className="pr-page-header-inner">
          <h1 className="pr-page-title">Projects</h1>
          <p className="pr-page-sub">Operational &amp; creative projects — refurbs, redesigns, anything bigger than a tackle list item.</p>
        </div>
      </header>

      <div className="pr-controls">
        <div className="pr-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`pr-filter ${filter === f.key ? 'pr-filter--active' : ''}`}
              onClick={() => onFilterChange(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <form className="pr-add-form" onSubmit={handleAdd}>
          <Plus size={15} className="pr-add-icon" />
          <input
            ref={addRef}
            className="pr-add-input"
            placeholder="New project…"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
          />
          {addTitle.trim() && <button type="submit" className="pr-add-submit">Create</button>}
        </form>
      </div>

      {sorted.length === 0 ? (
        <div className="pr-empty">No {filter !== 'all' ? filterLabel : ''} projects yet.</div>
      ) : (
        <div className="pr-grid">
          {sorted.map((p) => <ProjectCard key={p.id} project={p} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  )
}

// ─── Projects (page) ──────────────────────────────────────────────────────────

export default function Projects({ projectFocus, onClearProjectFocus }) {
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('active')
  const [openId, setOpenId]       = useState(projectFocus?.id || null)
  const [cameFromTaskFocus, setCameFromTaskFocus] = useState(Boolean(projectFocus?.id))

  useEffect(() => {
    const q = query(collection(db, COL), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (projectFocus?.id) {
      setOpenId(projectFocus.id)
      setCameFromTaskFocus(true)
      onClearProjectFocus?.()
    }
  }, [projectFocus, onClearProjectFocus])

  const handleOpen = (id) => { setOpenId(id); setCameFromTaskFocus(false) }
  const handleBack = () => { setOpenId(null); setCameFromTaskFocus(false) }

  const handleAddProject = async (title) => {
    await addDoc(collection(db, COL), {
      title, status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
  }

  const handleUpdateTitle  = (id, title)  => updateDoc(doc(db, COL, id), { title, updatedAt: serverTimestamp() })
  const handleUpdateStatus = (id, status) => updateDoc(doc(db, COL, id), { status, updatedAt: serverTimestamp() })

  const handleDeleteProject = async (id) => {
    const batch = writeBatch(db)
    for (const sub of ['notes', 'links', 'tasks']) {
      const snap = await getDocs(collection(db, COL, id, sub))
      snap.forEach((d) => batch.delete(d.ref))
    }
    const filesSnap = await getDocs(collection(db, COL, id, 'files'))
    filesSnap.forEach((d) => batch.delete(d.ref))
    batch.delete(doc(db, COL, id))
    await batch.commit()
    // Best-effort storage cleanup
    filesSnap.forEach(async (d) => {
      const path = d.data().storagePath
      if (path) try { await deleteObject(storageRef(storage, path)) } catch {}
    })
    setOpenId(null)
  }

  if (loading) {
    return (
      <div className="pr-state">
        <span className="pr-spinner" />
        Loading projects…
      </div>
    )
  }

  const openProject = projects.find((p) => p.id === openId)

  if (openProject) {
    return (
      <ProjectDetailView
        key={openProject.id}
        project={openProject}
        initialTab={cameFromTaskFocus ? 'tasks' : 'overview'}
        onBack={handleBack}
        onUpdateTitle={handleUpdateTitle}
        onUpdateStatus={handleUpdateStatus}
        onDelete={handleDeleteProject}
      />
    )
  }

  return (
    <ProjectsListView
      projects={projects}
      filter={filter}
      onFilterChange={setFilter}
      onOpen={handleOpen}
      onAdd={handleAddProject}
    />
  )
}
