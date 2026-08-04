import { useState, useEffect, useRef } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../firebase'
import {
  Wrench, ArrowLeft, Plus, Trash2, Check, Pencil, X,
  Calendar, FileText, File, Upload, MessageSquare,
  CheckSquare, Paperclip, AlertCircle,
} from 'lucide-react'
import './Maintenance.css'

const COL = 'maintenance'

const PRIORITIES = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high',   label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low',    label: 'Low' },
]

const CATEGORIES = [
  { key: 'plumbing',   label: 'Plumbing' },
  { key: 'electrical', label: 'Electrical' },
  { key: 'structural', label: 'Structural' },
  { key: 'equipment',  label: 'Equipment' },
  { key: 'other',      label: 'Other' },
]

const STATUSES = [
  { key: 'open',     label: 'Open' },
  { key: 'reported', label: 'Reported' },
  { key: 'quoted',   label: 'Quoted' },
  { key: 'booked',   label: 'Booked' },
  { key: 'done',     label: 'Done' },
]

const FILTERS = [
  { key: 'active',   label: 'Active' },
  { key: 'open',     label: 'Open' },
  { key: 'reported', label: 'Reported' },
  { key: 'quoted',   label: 'Quoted' },
  { key: 'booked',   label: 'Booked' },
  { key: 'done',     label: 'Done' },
  { key: 'all',      label: 'All' },
]

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 }

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts?.toDate) return ''
  const diff = Date.now() - ts.toDate().getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isOverdue(dateStr) {
  if (!dateStr) return false
  const [y, m, d] = dateStr.split('-').map(Number)
  const due = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return due < today
}

function isDueSoon(dateStr) {
  if (!dateStr) return false
  const [y, m, d] = dateStr.split('-').map(Number)
  const due = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const soon = new Date(today); soon.setDate(today.getDate() + 7)
  return due >= today && due <= soon
}

function formatDueDate(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fileTypeIcon(type) {
  if (!type) return <File size={14} />
  if (type.startsWith('image/') || type === 'application/pdf') return <FileText size={14} />
  return <File size={14} />
}

// ── FilesTab ──────────────────────────────────────────────────────────────────

function FilesTab({ issueId }) {
  const [files, setFiles]                   = useState([])
  const [uploading, setUploading]           = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError]       = useState('')
  const fileInputRef                        = useRef(null)

  useEffect(() => {
    const q = query(collection(db, COL, issueId, 'files'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setFiles(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [issueId])

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''

    setUploading(true)
    setUploadError('')
    setUploadProgress(0)

    const filename    = `${Date.now()}_${file.name}`
    const storagePath = `maintenance/${issueId}/${filename}`
    const storageRef  = ref(storage, storagePath)
    const task        = uploadBytesResumable(storageRef, file)

    task.on(
      'state_changed',
      (snap) => {
        setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100))
      },
      (err) => {
        console.error('Upload error:', err)
        setUploadError('Upload failed — ensure Firebase Storage rules allow anonymous writes.')
        setUploading(false)
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          await addDoc(collection(db, COL, issueId, 'files'), {
            name: file.name, url, storagePath,
            type: file.type, size: file.size,
            createdAt: serverTimestamp(),
          })
        } catch (err) {
          console.error('File record error:', err)
          setUploadError('File uploaded but record could not be saved.')
        } finally {
          setUploading(false)
          setUploadProgress(0)
        }
      }
    )
  }

  const handleDelete = async (file) => {
    try { await deleteObject(ref(storage, file.storagePath)) }
    catch (err) { console.warn('Storage delete failed:', err) }
    await deleteDoc(doc(db, COL, issueId, 'files', file.id))
  }

  return (
    <div className="mnt-files-tab">
      <div className="mnt-upload-row">
        <button
          className="mnt-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload size={13} />
          {uploading ? `Uploading… ${uploadProgress}%` : 'Upload quote / invoice'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="mnt-file-input-hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
          onChange={handleFileSelect}
        />
      </div>

      {uploadError && <p className="mnt-upload-error">{uploadError}</p>}

      {uploading && (
        <div className="mnt-progress-bar-wrap">
          <div className="mnt-progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      {files.length === 0 && !uploading && (
        <p className="mnt-empty">No files uploaded yet.</p>
      )}

      {files.length > 0 && (
        <div className="mnt-files-list">
          {files.map((file) => (
            <div key={file.id} className="mnt-file-row">
              <span className="mnt-file-icon">{fileTypeIcon(file.type)}</span>
              <a
                className="mnt-file-name"
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {file.name}
              </a>
              <span className="mnt-file-size mono">{formatFileSize(file.size)}</span>
              <button
                className="mnt-action mnt-action--delete"
                onClick={() => handleDelete(file)}
                title="Delete file"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MntTaskRow ────────────────────────────────────────────────────────────────

function MntTaskRow({ task, issueId }) {
  const [showDate, setShowDate] = useState(false)
  const dateRef = useRef(null)

  useEffect(() => { if (showDate) dateRef.current?.focus() }, [showDate])

  const toggle  = () => updateDoc(doc(db, COL, issueId, 'tasks', task.id), { completed: !task.completed })
  const remove  = () => deleteDoc(doc(db, COL, issueId, 'tasks', task.id))
  const setDate = (v) => {
    updateDoc(doc(db, COL, issueId, 'tasks', task.id), { dueDate: v || null })
    setShowDate(false)
  }

  const overdue = !task.completed && isOverdue(task.dueDate)
  const soon    = !task.completed && !overdue && isDueSoon(task.dueDate)

  return (
    <div className={`mnt-task-row ${task.completed ? 'mnt-task-row--done' : ''}`}>
      <button
        className={`mnt-checkbox ${task.completed ? 'mnt-checkbox--checked' : ''}`}
        onClick={toggle}
        title={task.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {task.completed && <Check size={10} strokeWidth={3} />}
      </button>

      <span className="mnt-task-title">{task.title}</span>

      {task.dueDate && !showDate && (
        <button
          className={`mnt-task-due mono ${overdue ? 'mnt-task-due--overdue' : ''} ${soon ? 'mnt-task-due--soon' : ''}`}
          onClick={() => setShowDate(true)}
          title="Change due date"
        >
          {overdue && <span className="mnt-due-dot" />}
          {formatDueDate(task.dueDate)}
        </button>
      )}

      {showDate && (
        <input
          ref={dateRef}
          type="date"
          className="mnt-date-input"
          defaultValue={task.dueDate || ''}
          onChange={(e) => setDate(e.target.value)}
          onBlur={() => setShowDate(false)}
        />
      )}

      <div className="mnt-task-actions">
        {!task.dueDate && !showDate && (
          <button className="mnt-action" onClick={() => setShowDate(true)} title="Set due date">
            <Calendar size={12} />
          </button>
        )}
        <button className="mnt-action mnt-action--delete" onClick={remove} title="Delete task">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

// ── MntDetailView ─────────────────────────────────────────────────────────────

function MntDetailView({ issue, onBack, onDeleteIssue }) {
  const [activeTab, setActiveTab] = useState('notes')

  // Editable title
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal]         = useState(issue.title)
  const titleRef = useRef(null)
  useEffect(() => { if (editingTitle) titleRef.current?.focus() }, [editingTitle])
  useEffect(() => { setTitleVal(issue.title) }, [issue.title])

  // Editable cost
  const [editingCost, setEditingCost] = useState(false)
  const [costVal, setCostVal]         = useState(issue.cost != null ? String(issue.cost) : '')
  const costRef = useRef(null)
  useEffect(() => { if (editingCost) costRef.current?.focus() }, [editingCost])
  useEffect(() => { setCostVal(issue.cost != null ? String(issue.cost) : '') }, [issue.cost])

  // Notes
  const [notes, setNotes]       = useState([])
  const [noteText, setNoteText] = useState('')
  const noteRef = useRef(null)
  useEffect(() => {
    const q = query(collection(db, COL, issue.id, 'notes'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [issue.id])

  // Tasks
  const [tasks, setTasks]         = useState([])
  const [taskTitle, setTaskTitle] = useState('')
  const taskRef = useRef(null)
  useEffect(() => {
    const q = query(collection(db, COL, issue.id, 'tasks'), orderBy('createdAt', 'asc'))
    return onSnapshot(q, (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [issue.id])

  const commitTitle = () => {
    const t = titleVal.trim()
    if (t && t !== issue.title) updateDoc(doc(db, COL, issue.id), { title: t, updatedAt: serverTimestamp() })
    else setTitleVal(issue.title)
    setEditingTitle(false)
  }

  const commitCost = () => {
    const val = parseFloat(costVal)
    const newCost = isNaN(val) ? null : Math.max(0, val)
    updateDoc(doc(db, COL, issue.id), { cost: newCost, updatedAt: serverTimestamp() })
    setEditingCost(false)
  }

  const handleField = (field, value) =>
    updateDoc(doc(db, COL, issue.id), { [field]: value, updatedAt: serverTimestamp() })

  const addNote = async (e) => {
    e.preventDefault()
    const t = noteText.trim()
    if (!t) return
    await addDoc(collection(db, COL, issue.id, 'notes'), { text: t, createdAt: serverTimestamp() })
    setNoteText('')
    noteRef.current?.focus()
  }

  const deleteNote = (noteId) => deleteDoc(doc(db, COL, issue.id, 'notes', noteId))

  const addTask = async (e) => {
    e.preventDefault()
    const t = taskTitle.trim()
    if (!t) return
    await addDoc(collection(db, COL, issue.id, 'tasks'), {
      title: t, completed: false, dueDate: null, createdAt: serverTimestamp(),
    })
    setTaskTitle('')
    taskRef.current?.focus()
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this issue and all its data?')) return
    const batch = writeBatch(db)
    notes.forEach((n) => batch.delete(doc(db, COL, issue.id, 'notes', n.id)))
    tasks.forEach((t) => batch.delete(doc(db, COL, issue.id, 'tasks', t.id)))
    batch.delete(doc(db, COL, issue.id))
    await batch.commit()
    onDeleteIssue()
  }

  const completedCount = tasks.filter((t) => t.completed).length

  return (
    <div className="mnt-detail">

      {/* ── Header ── */}
      <div className="mnt-detail-header">
        <button className="mnt-back-btn" onClick={onBack} title="Back">
          <ArrowLeft size={16} />
        </button>

        <div className="mnt-detail-title-wrap">
          {editingTitle ? (
            <input
              ref={titleRef}
              className="mnt-detail-title-input"
              value={titleVal}
              onChange={(e) => setTitleVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') { setTitleVal(issue.title); setEditingTitle(false) }
              }}
              onBlur={commitTitle}
            />
          ) : (
            <h1 className="mnt-detail-title" onClick={() => setEditingTitle(true)}>
              {issue.title}
              <Pencil size={13} className="mnt-edit-icon" />
            </h1>
          )}
        </div>

        <button
          className="mnt-action mnt-action--delete mnt-hdr-delete"
          onClick={handleDelete}
          title="Delete issue"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* ── Meta row ── */}
      <div className="mnt-detail-meta">
        <div className="mnt-meta-field">
          <label className="mnt-meta-label mono">Category</label>
          <select
            className="mnt-meta-select"
            value={issue.category || 'other'}
            onChange={(e) => handleField('category', e.target.value)}
          >
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>

        <div className="mnt-meta-field">
          <label className="mnt-meta-label mono">Priority</label>
          <select
            className={`mnt-meta-select mnt-meta-select--priority mnt-meta-select--${issue.priority || 'medium'}`}
            value={issue.priority || 'medium'}
            onChange={(e) => handleField('priority', e.target.value)}
          >
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>

        <div className="mnt-meta-field">
          <label className="mnt-meta-label mono">Status</label>
          <select
            className={`mnt-meta-select mnt-meta-select--status mnt-meta-select--status-${issue.status || 'open'}`}
            value={issue.status || 'open'}
            onChange={(e) => handleField('status', e.target.value)}
          >
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>

        <div className="mnt-meta-field mnt-meta-field--cost">
          <label className="mnt-meta-label mono">Cost / Quote</label>
          <div className="mnt-cost-wrap">
            <span className="mnt-cost-symbol">£</span>
            {editingCost ? (
              <input
                ref={costRef}
                type="number"
                className="mnt-cost-input"
                value={costVal}
                onChange={(e) => setCostVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitCost()
                  if (e.key === 'Escape') setEditingCost(false)
                }}
                onBlur={commitCost}
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            ) : (
              <button className="mnt-cost-btn" onClick={() => setEditingCost(true)}>
                {issue.cost != null ? Number(issue.cost).toFixed(2) : '—'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="mnt-tabs">
        <button
          className={`mnt-tab ${activeTab === 'notes' ? 'mnt-tab--active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          <MessageSquare size={13} />
          Notes
          {notes.length > 0 && <span className="mnt-tab-count mono">{notes.length}</span>}
        </button>
        <button
          className={`mnt-tab ${activeTab === 'tasks' ? 'mnt-tab--active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          <CheckSquare size={13} />
          Tasks
          {tasks.length > 0 && (
            <span className="mnt-tab-count mono">{completedCount}/{tasks.length}</span>
          )}
        </button>
        <button
          className={`mnt-tab ${activeTab === 'files' ? 'mnt-tab--active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          <Paperclip size={13} />
          Files
        </button>
      </div>

      {/* ── Tab content ── */}
      <div className="mnt-tab-content">

        {/* Notes */}
        {activeTab === 'notes' && (
          <div className="mnt-notes-tab">
            <form className="mnt-note-form" onSubmit={addNote}>
              <textarea
                ref={noteRef}
                className="mnt-note-textarea"
                placeholder="Add a note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addNote(e)
                }}
              />
              <div className="mnt-note-footer-row">
                <span className="mono mnt-note-hint">Ctrl+Enter to save</span>
                {noteText.trim() && (
                  <button type="submit" className="mnt-btn mnt-btn--primary">
                    <Plus size={13} /> Add note
                  </button>
                )}
              </div>
            </form>

            {notes.length === 0 && (
              <p className="mnt-empty">No notes yet.</p>
            )}

            <div className="mnt-notes-list">
              {notes.map((note) => (
                <div key={note.id} className="mnt-note-row">
                  <p className="mnt-note-text">{note.text}</p>
                  <div className="mnt-note-meta">
                    <span className="mnt-note-time mono">{timeAgo(note.createdAt)}</span>
                    <button
                      className="mnt-action mnt-action--delete"
                      onClick={() => deleteNote(note.id)}
                      title="Delete note"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tasks */}
        {activeTab === 'tasks' && (
          <div className="mnt-tasks-tab">
            <form className="mnt-task-add-form" onSubmit={addTask}>
              <Plus size={13} className="mnt-add-icon" />
              <input
                ref={taskRef}
                className="mnt-task-add-input"
                placeholder="Add a task…"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
              />
              {taskTitle.trim() && (
                <button type="submit" className="mnt-btn mnt-btn--add">Add</button>
              )}
            </form>

            {tasks.length === 0 && <p className="mnt-empty">No tasks yet.</p>}

            <div className="mnt-tasks-list">
              {tasks.map((task) => (
                <MntTaskRow key={task.id} task={task} issueId={issue.id} />
              ))}
            </div>
          </div>
        )}

        {/* Files */}
        {activeTab === 'files' && <FilesTab issueId={issue.id} />}
      </div>
    </div>
  )
}

// ── MntCard ───────────────────────────────────────────────────────────────────

function MntCard({ issue, onClick }) {
  const priorityLabel = PRIORITIES.find((p) => p.key === issue.priority)?.label || 'Medium'
  const categoryLabel = CATEGORIES.find((c) => c.key === issue.category)?.label || 'Other'
  const statusLabel   = STATUSES.find((s) => s.key === issue.status)?.label || 'Open'

  return (
    <button className="mnt-card" onClick={onClick}>
      <div className="mnt-card-top">
        <span className={`mnt-priority-badge mnt-priority-badge--${issue.priority || 'medium'}`}>
          {issue.priority === 'urgent' && <AlertCircle size={11} />}
          {priorityLabel}
        </span>
        <span className={`mnt-status-badge mnt-status-badge--${issue.status || 'open'}`}>
          {statusLabel}
        </span>
      </div>
      <h3 className="mnt-card-title">{issue.title}</h3>
      <div className="mnt-card-bottom">
        <span className="mnt-category-badge mono">{categoryLabel}</span>
        {issue.cost != null && (
          <span className="mnt-card-cost mono">£{Number(issue.cost).toFixed(2)}</span>
        )}
      </div>
    </button>
  )
}

// ── MntListView ───────────────────────────────────────────────────────────────

function MntListView({ issues, onOpenIssue }) {
  const [filter, setFilter]           = useState('active')
  const [addTitle, setAddTitle]       = useState('')
  const [addCategory, setAddCategory] = useState('other')
  const [addPriority, setAddPriority] = useState('medium')
  const addRef = useRef(null)

  const addIssue = async (e) => {
    e.preventDefault()
    const title = addTitle.trim()
    if (!title) return
    await addDoc(collection(db, COL), {
      title, category: addCategory, priority: addPriority,
      status: 'open', cost: null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    setAddTitle('')
    addRef.current?.focus()
  }

  const filtered = (() => {
    let list = issues
    if (filter === 'active') list = issues.filter((i) => i.status !== 'done')
    else if (filter !== 'all') list = issues.filter((i) => i.status === filter)
    return [...list].sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 4
      const pb = PRIORITY_ORDER[b.priority] ?? 4
      if (pa !== pb) return pa - pb
      return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
    })
  })()

  const activeCount = issues.filter((i) => i.status !== 'done').length

  return (
    <div className="mnt-page">
      <div className="mnt-page-header">
        <Wrench size={20} className="mnt-page-icon" />
        <h1 className="mnt-page-title display">Maintenance</h1>
        {activeCount > 0 && (
          <span className="mnt-open-count mono">{activeCount} open</span>
        )}
      </div>

      {/* Add form */}
      <form className="mnt-add-form" onSubmit={addIssue}>
        <input
          ref={addRef}
          className="mnt-add-title"
          placeholder="New issue title…"
          value={addTitle}
          onChange={(e) => setAddTitle(e.target.value)}
        />
        <select
          className="mnt-add-select"
          value={addCategory}
          onChange={(e) => setAddCategory(e.target.value)}
        >
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select
          className="mnt-add-select"
          value={addPriority}
          onChange={(e) => setAddPriority(e.target.value)}
        >
          {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        {addTitle.trim() && (
          <button type="submit" className="mnt-btn mnt-btn--primary">
            <Plus size={13} /> Add
          </button>
        )}
      </form>

      {/* Filter pills */}
      <div className="mnt-filters">
        {FILTERS.map((f) => {
          const count =
            f.key === 'active' ? issues.filter((i) => i.status !== 'done').length
            : f.key === 'all'  ? issues.length
            : issues.filter((i) => i.status === f.key).length
          return (
            <button
              key={f.key}
              className={`mnt-filter-pill ${filter === f.key ? 'mnt-filter-pill--active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {count > 0 && <span className="mnt-filter-count mono">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Issues */}
      {filtered.length === 0 ? (
        <div className="mnt-empty-state">
          <Wrench size={28} className="mnt-empty-icon" />
          <p>No {filter === 'all' ? '' : filter === 'active' ? 'active ' : filter + ' '}issues.</p>
        </div>
      ) : (
        <div className="mnt-issues-grid">
          {filtered.map((issue) => (
            <MntCard key={issue.id} issue={issue} onClick={() => onOpenIssue(issue.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Maintenance (page) ────────────────────────────────────────────────────────

export default function Maintenance({ maintenanceFocus, onClearMaintenanceFocus }) {
  const [issues, setIssues]         = useState([])
  const [selectedId, setSelectedId] = useState(maintenanceFocus?.id || null)

  useEffect(() => {
    const q = query(collection(db, COL), orderBy('createdAt', 'asc'))
    return onSnapshot(q, (snap) => {
      setIssues(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    }, (err) => console.error('Maintenance listener error:', err))
  }, [])

  useEffect(() => {
    if (maintenanceFocus?.id) setSelectedId(maintenanceFocus.id)
  }, [maintenanceFocus])

  const selectedIssue = issues.find((i) => i.id === selectedId)

  const handleBack = () => {
    setSelectedId(null)
    onClearMaintenanceFocus?.()
  }

  if (selectedId && selectedIssue) {
    return (
      <MntDetailView
        issue={selectedIssue}
        onBack={handleBack}
        onDeleteIssue={handleBack}
      />
    )
  }

  return (
    <MntListView
      issues={issues}
      onOpenIssue={(id) => setSelectedId(id)}
    />
  )
}
