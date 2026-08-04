import { useState, useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import {
  LayoutDashboard,
  ClipboardList,
  ListChecks,
  CalendarDays,
  Mail,
  CalendarClock,
  FolderKanban,
  Wrench,
  ChevronDown,
  ChevronUp,
  Menu,
  X,
} from 'lucide-react'
import './Sidebar.css'

const CADENCE_ITEMS = [
  { id: 'weekly',     label: 'Weekly' },
  { id: 'monthly',    label: 'Monthly' },
  { id: 'sixmonthly', label: '6-Monthly' },
  { id: 'yearly',     label: 'Yearly' },
  { id: 'all',        label: 'All' },
]

export default function Sidebar({ activePage, activeView, onNavigate, onViewChange }) {
  const [mobileOpen, setMobileOpen]         = useState(false)
  const [checklistsOpen, setChecklistsOpen] = useState(activePage === 'checklists')
  const [cadenceCounts, setCadenceCounts]   = useState({
    weekly: 0, monthly: 0, sixmonthly: 0, yearly: 0,
  })

  // Live incomplete counts per cadence
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'recurring_tasks'),
      (snap) => {
        const counts = { weekly: 0, monthly: 0, sixmonthly: 0, yearly: 0 }
        snap.docs.forEach((d) => {
          const { cadence, completed } = d.data()
          if (!completed && counts[cadence] !== undefined) counts[cadence]++
        })
        setCadenceCounts(counts)
      },
      (err) => console.error('Sidebar counter error:', err)
    )
    return () => unsub()
  }, [])

  // Auto-expand checklists sub-nav when on that page
  useEffect(() => {
    if (activePage === 'checklists') setChecklistsOpen(true)
  }, [activePage])

  const handleNav = (page) => {
    onNavigate(page)
    setMobileOpen(false)
  }

  const handleChecklistsParent = () => {
    const opening = !checklistsOpen
    setChecklistsOpen(opening)
    if (opening) {
      onNavigate('checklists')
      if (activePage !== 'checklists') onViewChange('weekly')
    }
  }

  const handleCadence = (id) => {
    onNavigate('checklists')
    onViewChange(id)
    setMobileOpen(false)
  }

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="sidebar-mobile-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
        {/* Wordmark */}
        <div className="sidebar-brand">
          <span className="sidebar-brand__fox display">FOX</span>
          <span className="sidebar-brand__amp">&amp;</span>
          <span className="sidebar-brand__hounds display">HOUNDS</span>
          <span className="sidebar-brand__role mono">MANAGER</span>
        </div>

        <div className="sidebar-divider" />

        {/* Nav */}
        <nav className="sidebar-nav">

          {/* Dashboard */}
          <button
            className={`sidebar-nav__item ${activePage === 'dashboard' ? 'sidebar-nav__item--active' : ''}`}
            onClick={() => handleNav('dashboard')}
          >
            <LayoutDashboard size={16} strokeWidth={1.75} />
            <span className="sidebar-nav__label">Dashboard</span>
          </button>

          {/* Tackle List */}
          <button
            className={`sidebar-nav__item ${activePage === 'tackle' ? 'sidebar-nav__item--active' : ''}`}
            onClick={() => handleNav('tackle')}
          >
            <ClipboardList size={16} strokeWidth={1.75} />
            <span className="sidebar-nav__label">Tackle List</span>
            <span className="sidebar-nav__tag mono">TODAY</span>
          </button>

          {/* Checklists parent */}
          <button
            className={`sidebar-nav__item sidebar-nav__item--parent ${activePage === 'checklists' ? 'sidebar-nav__item--active' : ''}`}
            onClick={handleChecklistsParent}
          >
            <ListChecks size={16} strokeWidth={1.75} />
            <span className="sidebar-nav__label">Checklists</span>
            <span className="sidebar-nav__chevron">
              {checklistsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          </button>

          {/* Cadence sub-nav */}
          <div className={`sidebar-subnav ${checklistsOpen ? 'sidebar-subnav--open' : ''}`}>
            {CADENCE_ITEMS.map(({ id, label }) => {
              const count = id !== 'all' ? cadenceCounts[id] : null
              return (
                <button
                  key={id}
                  className={`sidebar-subnav__item ${
                    activePage === 'checklists' && activeView === id
                      ? 'sidebar-subnav__item--active'
                      : ''
                  } ${id === 'all' ? 'sidebar-subnav__item--all' : ''}`}
                  onClick={() => handleCadence(id)}
                >
                  <span className="sidebar-subnav__dot" />
                  <span className="sidebar-subnav__label">{label}</span>
                  {count > 0 && (
                    <span className="sidebar-subnav__counter mono">{count}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Meetings */}
          <button
            className={`sidebar-nav__item ${activePage === 'meetings' ? 'sidebar-nav__item--active' : ''}`}
            onClick={() => handleNav('meetings')}
          >
            <CalendarDays size={16} strokeWidth={1.75} />
            <span className="sidebar-nav__label">Meetings</span>
          </button>

          {/* Inbox */}
          <button
            className={`sidebar-nav__item ${activePage === 'inbox' ? 'sidebar-nav__item--active' : ''}`}
            onClick={() => handleNav('inbox')}
          >
            <Mail size={16} strokeWidth={1.75} />
            <span className="sidebar-nav__label">Inbox</span>
          </button>

          {/* Events */}
          <button
            className={`sidebar-nav__item ${activePage === 'events' ? 'sidebar-nav__item--active' : ''}`}
            onClick={() => handleNav('events')}
          >
            <CalendarClock size={16} strokeWidth={1.75} />
            <span className="sidebar-nav__label">Events</span>
          </button>

          {/* Projects */}
          <button
            className={`sidebar-nav__item ${activePage === 'projects' ? 'sidebar-nav__item--active' : ''}`}
            onClick={() => handleNav('projects')}
          >
            <FolderKanban size={16} strokeWidth={1.75} />
            <span className="sidebar-nav__label">Projects</span>
          </button>

          {/* Maintenance */}
          <button
            className={`sidebar-nav__item ${activePage === 'maintenance' ? 'sidebar-nav__item--active' : ''}`}
            onClick={() => handleNav('maintenance')}
          >
            <Wrench size={16} strokeWidth={1.75} />
            <span className="sidebar-nav__label">Maintenance</span>
          </button>

        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <span className="mono sidebar-footer__version">v0.8.0</span>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}
    </>
  )
}
