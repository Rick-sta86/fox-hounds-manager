// Fox & Hounds Manager — Tackle List with drag-to-reorder and due dates

import { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, query, orderBy, writeBatch
} from 'firebase/firestore'
import { db } from '../firebase'
import {
  Plus, Check, Trash2, Pencil, X, ChevronsDown, GripVertical, Calendar
} from 'lucide-react'
import './TackleList.css'

const COL = 'tackle_list'

// ─── Date helpers ─────────────────────────────────────────────────────────────

function isOverdue(dateStr) {
  if (!dateStr) return false
  const [y, m, d] = dateStr.split('-')
  const due = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return due < today
}

function isDueSoon(dateStr) {
  // Due today or in the next 2 days
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

// ─── TaskRow sub-component ────────────────────────────────────────────────────

function TaskRow({ task, isDragging, onToggle, onDelete, onStartEdit, onUpdateDueDate }) {
  const dateRef = useRef(null)

  const overdue  = !task.completed && isOverdue(task.dueDate)
  const dueSoon  = !task.completed && !overdue && isDueSoon(task.dueDate)
  const dateLabel = formatDueDate(task.dueDate)

  const handleDateChange   = (e) => onUpdateDueDate(task.id, e.target.value || null)
  const handleCalendarClick = (e) => {
    e.stopPropagation()
    dateRef.current?.showPicker?.()
    dateRef.current?.focus()
  }

  return (
    <div className={`task-row ${task.completed ? 'task-row--done' : ''} ${isDragging ? 'task-row--dragging' : ''}`}>

      {/* Drag handle */}
      {!task.completed && (
        <div className="task-row__drag-handle" title="Drag to reorder">
          <GripVertical size={14} />
        </div>
      )}

      {/* Checkbox */}
      <button
        className={`task-row__check ${task.completed ? 'task-row__check--done' : ''}`}
        onClick={() => onToggle(task.id, task.completed)}
      >
        {task.completed && <Check size={11} strokeWidth={3} />}
      </button>

      {/* Text */}
      <span className="task-row__text">
        {task.text}
      </span>

      {/* Due date display */}
      {dateLabel && (
        <span className={`task-row__due ${overdue ? 'task-row__due--overdue' : ''} ${dueSoon ? 'task-row__due--soon' : ''}`}>
          {overdue && <span className="task-row__due-dot" />}
          {dateLabel}
        </span>
      )}

      {/* Actions */}
      <div className="task-row__actions">
        {!task.completed && (
          <>
            <button
              className={`task-row__action task-row__action--date ${task.dueDate ? 'task-row__action--date-set' : ''}`}
              onClick={handleCalendarClick}
              title={task.dueDate ? 'Change due date' : 'Set due date'}
            >
              <Calendar size={13} />
            </button>
            <input
              ref={dateRef}
              type="date"
              className="task-row__date-input"
              value={task.dueDate || ''}
              onChange={handleDateChange}
              tabIndex={-1}
            />
            <button
              className="task-row__action task-row__action--edit"
              onClick={() => onStartEdit(task)}
              title="Edit"
            >
              <Pencil size={14} />
            </button>
          </>
        )}
        <button
          className="task-row__action task-row__action--delete"
          onClick={() => onDelete(task.id)}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── TackleList page ──────────────────────────────────────────────────────────

export default function TackleList() {
  const [tasks, setTasks]               = useState([])
  const [inputVal, setInputVal]         = useState('')
  const [editingId, setEditingId]       = useState(null)
  const [editVal, setEditVal]           = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [loading, setLoading]           = useState(true)
  const [dragIndex, setDragIndex]       = useState(null)
  const [overIndex, setOverIndex]       = useState(null)
  const inputRef = useRef(null)
  const editRef  = useRef(null)

  // ── Firestore listener ────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, COL), orderBy('order', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus()
  }, [editingId])

  // ── Sorted: incomplete first (by order), completed below ──────────────────
  const pending = tasks.filter((t) => !t.completed)
  const done    = tasks.filter((t) => t.completed)
  const sorted  = [...pending, ...done]

  // ── Add task ──────────────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e?.preventDefault()
    const text = inputVal.trim()
    if (!text) return
    const maxOrder = pending.length ? Math.max(...pending.map((t) => t.order ?? 0)) : -1
    await addDoc(collection(db, COL), {
      text, completed: false, dueDate: null,
      order: maxOrder + 1,
      createdAt: serverTimestamp(),
    })
    setInputVal('')
    inputRef.current?.focus()
  }

  // ── Toggle ────────────────────────────────────────────────────────────────
  const handleToggle = async (id, current) => {
    await updateDoc(doc(db, COL, id), { completed: !current })
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    await deleteDoc(doc(db, COL, id))
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  const startEdit = (task) => { setEditingId(task.id); setEditVal(task.text) }
  const commitEdit = async () => {
    const text = editVal.trim()
    if (text && text !== tasks.find((t) => t.id === editingId)?.text) {
      await updateDoc(doc(db, COL, editingId), { text })
    }
    setEditingId(null)
  }
  const cancelEdit = () => setEditingId(null)
  const handleEditKey = (e) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') cancelEdit()
  }

  // ── Due date ──────────────────────────────────────────────────────────────
  const handleUpdateDueDate = async (id, dueDate) => {
    await updateDoc(doc(db, COL, id), { dueDate: dueDate ?? null })
  }

  // ── Clear completed ───────────────────────────────────────────────────────
  const handleClear = async () => {
    if (!confirmClear) { setConfirmClear(true); return }
    await Promise.all(done.map((t) => deleteDoc(doc(db, COL, t.id))))
    setConfirmClear(false)
  }

  // ── Drag to reorder (pending tasks only) ──────────────────────────────────
  const handleDragStart = (e, index) => {
    if (sorted[index].completed) { e.preventDefault(); return }
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    if (sorted[index]?.completed) return
    e.dataTransfer.dropEffect = 'move'
    setOverIndex(index)
  }

  const handleDrop = async (e, index) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index || sorted[index]?.completed) {
      setDragIndex(null); setOverIndex(null); return
    }
    const newPending = [...pending]
    const dragged = newPending[dragIndex]
    newPending.splice(dragIndex, 1)
    newPending.splice(index, 0, dragged)
    setDragIndex(null); setOverIndex(null)

    const batch = writeBatch(db)
    newPending.forEach((task, i) => {
      batch.update(doc(db, COL, task.id), { order: i })
    })
    await batch.commit()
  }

  const handleDragEnd = () => { setDragIndex(null); setOverIndex(null) }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="tackle tackle--loading">
        <span className="tackle__spinner" />
      </div>
    )
  }

  return (
    <div className="tackle">
      {/* Header */}
      <div className="tackle__header">
        <div className="tackle__title-row">
          <h1 className="tackle__title display">Tackle List</h1>
          <span className="tackle__count mono">{pending.length} remaining</span>
        </div>

        {/* Add task input */}
        <form className="tackle__add-form" onSubmit={handleAdd}>
          <input
            ref={inputRef}
            className="tackle__add-input"
            placeholder="Add a task…"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd(e)}
          />
          <button type="submit" className="tackle__add-btn" disabled={!inputVal.trim()}>
            <Plus size={18} />
          </button>
        </form>
      </div>

      {/* Task list */}
      <div className="tackle__list">
        {sorted.length === 0 && (
          <div className="tackle__empty">
            <Check size={20} className="tackle__empty-icon" />
            <span>Nothing on the list. Add something above.</span>
          </div>
        )}

        {sorted.map((task, index) => {
          const isEditing = editingId === task.id
          return (
            <div
              key={task.id}
              draggable={!task.completed}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`task-row-wrapper ${overIndex === index && dragIndex !== index ? 'task-row-wrapper--over' : ''}`}
            >
              {isEditing ? (
                /* Edit mode — inline within the wrapper */
                <div className="task-row task-row--editing">
                  <input
                    ref={editRef}
                    className="task-row__edit"
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={handleEditKey}
                    onBlur={commitEdit}
                  />
                  <div className="task-row__actions task-row__actions--visible">
                    <button className="task-row__action task-row__action--cancel" onClick={cancelEdit} title="Cancel">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <TaskRow
                  task={task}
                  isDragging={dragIndex === index}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onStartEdit={startEdit}
                  onUpdateDueDate={handleUpdateDueDate}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      {done.length > 0 && (
        <div className="tackle__footer">
          <button
            className={`tackle__clear-btn ${confirmClear ? 'tackle__clear-btn--confirm' : ''}`}
            onClick={handleClear}
            onBlur={() => setConfirmClear(false)}
          >
            <ChevronsDown size={14} />
            {confirmClear ? 'Confirm — clear completed?' : `Clear ${done.length} completed`}
          </button>
        </div>
      )}
    </div>
  )
}
