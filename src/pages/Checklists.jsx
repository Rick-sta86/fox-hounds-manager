import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
// Note: setDoc is called via batch.set inside handleReset
import { db } from '../firebase';
import {
  Check,
  RotateCcw,
  Plus,
  Trash2,
  FileText,
  Pencil,
  X,
  Save,
  Calendar,
  GripVertical,
} from 'lucide-react';
import './Checklists.css';

const CADENCES = [
  { key: 'weekly',      label: 'Weekly',    abbr: 'W' },
  { key: 'monthly',     label: 'Monthly',   abbr: 'M' },
  { key: 'sixmonthly',  label: '6-Monthly', abbr: '6M' },
  { key: 'yearly',      label: 'Yearly',    abbr: 'Y' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-');
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split('-');
  const due = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return due < today;
}

// ─── Auto-expand textarea ─────────────────────────────────────────────────────

function AutoTextarea({ value, onChange, onBlur, placeholder }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="cl-notes-textarea"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      rows={1}
    />
  );
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────

function TaskRow({
  task, onToggle, onDelete, onUpdateText, onUpdateNotes, onUpdateDueDate,
  dragHandleProps, isDragging,
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [editing, setEditing]     = useState(false);
  const [editText, setEditText]   = useState(task.text);
  const [editNotes, setEditNotes] = useState(task.notes || '');
  const inputRef                  = useRef(null);
  const dateRef                   = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  // Sync notes if task updates externally
  useEffect(() => {
    setEditNotes(task.notes || '');
  }, [task.notes]);

  const commitEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== task.text) onUpdateText(task.id, trimmed);
    if (editNotes !== (task.notes || '')) onUpdateNotes(task.id, editNotes);
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditText(task.text);
    setEditNotes(task.notes || '');
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  const handleDateChange = (e) => onUpdateDueDate(task.id, e.target.value || null);
  const handleDateIconClick = (e) => {
    e.stopPropagation();
    dateRef.current?.showPicker?.();
    dateRef.current?.focus();
  };

  const hasNotes  = Boolean(task.notes && task.notes.trim());
  const overdue   = !task.completed && isOverdue(task.dueDate);
  const formatted = formatDate(task.dueDate);

  const handleRowClick = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) return;
    if (hasNotes) setNotesOpen((v) => !v);
  };

  return (
    <div
      className={`cl-task-row ${task.completed ? 'cl-task--done' : ''} ${hasNotes ? 'cl-task-row--has-notes' : ''} ${isDragging ? 'cl-task-row--dragging' : ''}`}
      onClick={handleRowClick}
    >
      <div className="cl-task-main">
        {/* Drag handle — only on incomplete tasks */}
        {!task.completed && (
          <div className="cl-drag-handle" {...dragHandleProps} title="Drag to reorder">
            <GripVertical size={14} />
          </div>
        )}

        {/* Checkbox */}
        <button
          className={`cl-checkbox ${task.completed ? 'cl-checkbox--checked' : ''}`}
          onClick={() => onToggle(task.id, task.completed)}
          aria-label={task.completed ? 'Uncheck task' : 'Check task'}
        >
          {task.completed && <Check size={11} strokeWidth={3} />}
        </button>

        {/* Text */}
        {editing ? (
          <input
            ref={inputRef}
            className="cl-task-edit-input"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <span
            className="cl-task-text"
            onDoubleClick={() => !task.completed && setEditing(true)}
          >
            {task.text}
          </span>
        )}

        {/* Due date */}
        <div className="cl-due-wrapper" onClick={(e) => e.stopPropagation()}>
          {formatted && (
            <span className={`cl-due-label ${overdue ? 'cl-due-label--overdue' : ''}`}>
              {overdue && <span className="cl-due-overdue-dot" />}
              {formatted}
            </span>
          )}
          <button
            className={`cl-action cl-action--date ${task.dueDate ? 'cl-action--date-set' : ''}`}
            onClick={handleDateIconClick}
            title={task.dueDate ? 'Change due date' : 'Set due date'}
          >
            <Calendar size={13} />
          </button>
          <input
            ref={dateRef}
            type="date"
            className="cl-date-input"
            value={task.dueDate || ''}
            onChange={handleDateChange}
            tabIndex={-1}
          />
        </div>

        {/* Actions */}
        <div className="cl-task-actions">
          {editing ? (
            <>
              <button className="cl-action cl-action--save" onClick={commitEdit} title="Save"><Save size={13} /></button>
              <button className="cl-action cl-action--cancel" onClick={cancelEdit} title="Cancel"><X size={13} /></button>
            </>
          ) : (
            <>
              {!task.completed && (
                <button className="cl-action" onClick={() => setEditing(true)} title="Edit task"><Pencil size={13} /></button>
              )}
              <button
                className={`cl-action cl-action--notes ${hasNotes ? 'cl-action--has-notes' : ''}`}
                onClick={(e) => { e.stopPropagation(); setNotesOpen((v) => !v); }}
                title={notesOpen ? 'Close notes' : 'Open notes'}
              >
                <FileText size={13} />
              </button>
              <button className="cl-action cl-action--delete" onClick={() => onDelete(task.id)} title="Delete task">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notes panel — auto-expanding */}
      {notesOpen && (
        <div className="cl-notes-panel">
          <AutoTextarea
            placeholder="Add notes or detail…"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            onBlur={() => {
              if (editNotes !== (task.notes || '')) onUpdateNotes(task.id, editNotes);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── CadenceGroup with drag-to-reorder ───────────────────────────────────────

function CadenceGroup({
  cadence, tasks, onToggle, onDelete, onUpdateText, onUpdateNotes,
  onUpdateDueDate, onReset, onAdd, onReorder, alwaysExpanded = false,
}) {
  const [addText, setAddText]       = useState('');
  const [collapsed, setCollapsed]   = useState(false);
  const [resetting, setResetting]   = useState(false);
  const [dragIndex, setDragIndex]   = useState(null);
  const [overIndex, setOverIndex]   = useState(null);
  const addInputRef                 = useRef(null);

  const pending = tasks.filter((t) => !t.completed);
  const done    = tasks.filter((t) => t.completed);
  const sorted  = [...pending, ...done];
  const allDone = tasks.length > 0 && pending.length === 0;

  const handleAdd = async (e) => {
    e.preventDefault();
    const trimmed = addText.trim();
    if (!trimmed) return;
    await onAdd(cadence.key, trimmed);
    setAddText('');
    addInputRef.current?.focus();
  };

  const handleReset = async () => {
    if (done.length === 0) return;
    setResetting(true);
    await onReset(cadence.key);
    setTimeout(() => setResetting(false), 600);
  };

  // ── Drag handlers (HTML5 drag API — works mouse + touch via pointer) ──
  const handleDragStart = (e, index) => {
    // Only allow dragging pending tasks
    if (sorted[index].completed) { e.preventDefault(); return; }
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (sorted[index]?.completed) return; // can't drop into done section
    e.dataTransfer.dropEffect = 'move';
    setOverIndex(index);
  };

  const handleDrop = async (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null); setOverIndex(null); return;
    }
    if (sorted[index]?.completed) { setDragIndex(null); setOverIndex(null); return; }

    // Reorder pending tasks only
    const newPending = [...pending];
    const draggedTask = newPending[dragIndex];
    newPending.splice(dragIndex, 1);
    newPending.splice(index, 1);
    newPending.splice(index, 0, draggedTask);

    setDragIndex(null);
    setOverIndex(null);
    await onReorder(newPending);
  };

  const handleDragEnd = () => { setDragIndex(null); setOverIndex(null); };

  const completePct = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
  const isCollapsed = alwaysExpanded ? false : collapsed;

  return (
    <section className={`cl-group ${allDone ? 'cl-group--complete' : ''}`}>
      <div className="cl-group-header">
        <div className="cl-group-header-left">
          <span className="cl-cadence-badge">{cadence.abbr}</span>
          <h2 className="cl-group-title">{cadence.label}</h2>
          <span className="cl-group-counter">
            <span className="cl-counter-done">{done.length}</span>
            <span className="cl-counter-sep">/</span>
            <span className="cl-counter-total">{tasks.length}</span>
          </span>
        </div>
        <div className="cl-group-header-right">
          {allDone && tasks.length > 0 && <span className="cl-complete-label">COMPLETE</span>}
          <button
            className={`cl-reset-btn ${done.length === 0 ? 'cl-reset-btn--disabled' : ''} ${resetting ? 'cl-reset-btn--active' : ''}`}
            onClick={handleReset}
            disabled={done.length === 0}
            title="Reset all"
          >
            <RotateCcw size={13} /> Reset
          </button>
          {!alwaysExpanded && (
            <button className="cl-collapse-btn" onClick={() => setCollapsed((v) => !v)}>
              <span className="cl-collapse-icon">{collapsed ? '↓' : '↑'}</span>
            </button>
          )}
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="cl-progress-track">
          <div
            className={`cl-progress-fill ${allDone ? 'cl-progress-fill--done' : ''}`}
            style={{ width: `${completePct}%` }}
          />
        </div>
      )}

      {!isCollapsed && (
        <div className="cl-task-list">
          {sorted.length === 0 && <p className="cl-empty-hint">No tasks yet — add one below.</p>}
          {sorted.map((task, index) => (
            <div
              key={task.id}
              draggable={!task.completed}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`cl-task-drag-wrapper ${overIndex === index && dragIndex !== index ? 'cl-task-drag-wrapper--over' : ''}`}
            >
              <TaskRow
                task={task}
                onToggle={onToggle}
                onDelete={onDelete}
                onUpdateText={onUpdateText}
                onUpdateNotes={onUpdateNotes}
                onUpdateDueDate={onUpdateDueDate}
                isDragging={dragIndex === index}
                dragHandleProps={{
                  onMouseDown: (e) => e.stopPropagation(),
                }}
              />
            </div>
          ))}
          <form className="cl-add-row" onSubmit={handleAdd}>
            <Plus size={14} className="cl-add-icon" />
            <input
              ref={addInputRef}
              className="cl-add-input"
              placeholder="Add task…"
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
            />
            {addText.trim() && <button type="submit" className="cl-add-submit">Add</button>}
          </form>
        </div>
      )}
    </section>
  );
}

// ─── Checklists (page) ────────────────────────────────────────────────────────

export default function Checklists({ activeView = 'weekly' }) {
  const [tasksByCadence, setTasksByCadence] = useState({
    weekly: [], monthly: [], sixmonthly: [], yearly: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'recurring_tasks'), orderBy('order', 'asc'));
    const unsub = onSnapshot(q,
      (snap) => {
        const grouped = { weekly: [], monthly: [], sixmonthly: [], yearly: [] };
        snap.forEach((d) => {
          const t = { id: d.id, ...d.data() };
          if (grouped[t.cadence]) grouped[t.cadence].push(t);
        });
        setTasksByCadence(grouped);
        setLoading(false);
      },
      (err) => { console.error(err); setError('Failed to connect to Firestore.'); setLoading(false); }
    );
    return () => unsub();
  }, []);

  const handleAdd = async (cadence, text) => {
    const existing = tasksByCadence[cadence];
    const maxOrder = existing.length ? Math.max(...existing.map((t) => t.order ?? 0)) : -1;
    try {
      await addDoc(collection(db, 'recurring_tasks'), {
        text, cadence, completed: false, notes: '', dueDate: null,
        order: maxOrder + 1, createdAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); setError('Failed to add task.'); }
  };

  const handleToggle = async (id, currentState) => {
    try { await updateDoc(doc(db, 'recurring_tasks', id), { completed: !currentState }); }
    catch (e) { console.error(e); setError('Failed to update task.'); }
  };

  const handleDelete = async (id) => {
    try { await deleteDoc(doc(db, 'recurring_tasks', id)); }
    catch (e) { console.error(e); setError('Failed to delete task.'); }
  };

  const handleUpdateText = async (id, text) => {
    try { await updateDoc(doc(db, 'recurring_tasks', id), { text }); }
    catch (e) { console.error(e); setError('Failed to update task.'); }
  };

  const handleUpdateNotes = async (id, notes) => {
    try { await updateDoc(doc(db, 'recurring_tasks', id), { notes }); }
    catch (e) { console.error(e); setError('Failed to save notes.'); }
  };

  const handleUpdateDueDate = async (id, dueDate) => {
    try { await updateDoc(doc(db, 'recurring_tasks', id), { dueDate: dueDate ?? null }); }
    catch (e) { console.error(e); setError('Failed to save due date.'); }
  };

  const handleReset = async (cadence) => {
    const tasks = tasksByCadence[cadence].filter((t) => t.completed);
    if (!tasks.length) return;
    const batch   = writeBatch(db);
    const pending = tasksByCadence[cadence].filter((t) => !t.completed);
    tasks.forEach((task, i) => {
      batch.update(doc(db, 'recurring_tasks', task.id), { completed: false, order: pending.length + i });
    });
    // Record manual reset so auto-reset doesn't fire again this period
    batch.set(doc(db, 'checklist_resets', cadence), { lastResetAt: serverTimestamp() });
    try { await batch.commit(); }
    catch (e) { console.error(e); setError('Failed to reset group.'); }
  };

  // ── Reorder — write new order values to Firestore in a batch ──
  const handleReorder = async (reorderedPending) => {
    const batch = writeBatch(db);
    reorderedPending.forEach((task, i) => {
      batch.update(doc(db, 'recurring_tasks', task.id), { order: i });
    });
    try { await batch.commit(); }
    catch (e) { console.error(e); setError('Failed to reorder tasks.'); }
  };

  const isAll     = activeView === 'all';
  const activeCad = CADENCES.find((c) => c.key === activeView);
  const pageTitle = isAll ? 'All Checklists' : (activeCad?.label ?? 'Checklists');
  const pageSub   = isAll
    ? 'All cadences — Weekly, Monthly, 6-Monthly, Yearly.'
    : `${activeCad?.label} recurring tasks.`;

  const sharedProps = {
    onToggle: handleToggle, onDelete: handleDelete,
    onUpdateText: handleUpdateText, onUpdateNotes: handleUpdateNotes,
    onUpdateDueDate: handleUpdateDueDate,
    onReset: handleReset, onAdd: handleAdd, onReorder: handleReorder,
  };

  if (loading) {
    return <div className="cl-state cl-state--loading"><span className="cl-spinner" />Loading checklists…</div>;
  }

  return (
    <div className="cl-page">
      <header className="cl-page-header">
        <div className="cl-page-header-inner">
          <h1 className="cl-page-title">{pageTitle}</h1>
          <p className="cl-page-sub">{pageSub}</p>
        </div>
      </header>

      {error && (
        <div className="cl-error-banner">
          {error}
          <button className="cl-error-dismiss" onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      <div className="cl-groups">
        {isAll
          ? CADENCES.map((cadence) => (
              <CadenceGroup key={cadence.key} cadence={cadence}
                tasks={tasksByCadence[cadence.key]} alwaysExpanded={false} {...sharedProps} />
            ))
          : activeCad && (
              <CadenceGroup cadence={activeCad}
                tasks={tasksByCadence[activeCad.key]} alwaysExpanded={true} {...sharedProps} />
            )
        }
      </div>
    </div>
  );
}
