import { useState } from 'react'
import { ClipboardList, ListChecks, CalendarDays, Mail, CalendarClock, FolderKanban, Wrench, ChevronUp, X } from 'lucide-react'
import './MobileNav.css'

const CADENCE_ITEMS = [
  { id: 'weekly',     label: 'Weekly' },
  { id: 'monthly',    label: 'Monthly' },
  { id: 'sixmonthly', label: '6-Monthly' },
  { id: 'yearly',     label: 'Yearly' },
  { id: 'all',        label: 'All' },
]

export default function MobileNav({ activePage, activeView, onNavigate, onViewChange }) {
  const [checklistDrawer, setChecklistDrawer] = useState(false)

  const handleTackle = () => {
    setChecklistDrawer(false)
    onNavigate('tackle')
  }

  const handleMeetings = () => {
    setChecklistDrawer(false)
    onNavigate('meetings')
  }

  const handleInbox = () => {
    setChecklistDrawer(false)
    onNavigate('inbox')
  }

  const handleProjects = () => {
    setChecklistDrawer(false)
    onNavigate('projects')
  }

  const handleEvents = () => {
    setChecklistDrawer(false)
    onNavigate('events')
  }

  const handleMaintenance = () => {
    setChecklistDrawer(false)
    onNavigate('maintenance')
  }

  const handleChecklistsTab = () => {
    if (activePage === 'checklists') {
      // Toggle drawer if already on checklists
      setChecklistDrawer((v) => !v)
    } else {
      onNavigate('checklists')
      onViewChange('weekly')
      setChecklistDrawer(true)
    }
  }

  const handleCadence = (id) => {
    onViewChange(id)
    onNavigate('checklists')
    setChecklistDrawer(false)
  }

  return (
    <>
      {/* Cadence drawer — slides up from bottom nav */}
      {checklistDrawer && (
        <div className="mobile-drawer">
          <div className="mobile-drawer-header">
            <span className="mobile-drawer-title">Checklists</span>
            <button
              className="mobile-drawer-close"
              onClick={() => setChecklistDrawer(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="mobile-drawer-items">
            {CADENCE_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                className={`mobile-drawer-item ${
                  activePage === 'checklists' && activeView === id
                    ? 'mobile-drawer-item--active'
                    : ''
                }`}
                onClick={() => handleCadence(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Overlay behind drawer */}
      {checklistDrawer && (
        <div
          className="mobile-drawer-overlay"
          onClick={() => setChecklistDrawer(false)}
        />
      )}

      {/* Bottom tab bar */}
      <nav className="mobile-nav">
        <button
          className={`mobile-nav__tab ${activePage === 'tackle' ? 'mobile-nav__tab--active' : ''}`}
          onClick={handleTackle}
        >
          <ClipboardList size={22} strokeWidth={1.75} />
          <span className="mobile-nav__label">Tackle List</span>
        </button>

        <button
          className={`mobile-nav__tab ${activePage === 'checklists' ? 'mobile-nav__tab--active' : ''}`}
          onClick={handleChecklistsTab}
        >
          <ListChecks size={22} strokeWidth={1.75} />
          <span className="mobile-nav__label">Checklists</span>
          {activePage === 'checklists' && (
            <ChevronUp size={10} className="mobile-nav__chevron" />
          )}
        </button>

        <button
          className={`mobile-nav__tab ${activePage === 'meetings' ? 'mobile-nav__tab--active' : ''}`}
          onClick={handleMeetings}
        >
          <CalendarDays size={22} strokeWidth={1.75} />
          <span className="mobile-nav__label">Meetings</span>
        </button>

        <button
          className={`mobile-nav__tab ${activePage === 'inbox' ? 'mobile-nav__tab--active' : ''}`}
          onClick={handleInbox}
        >
          <Mail size={22} strokeWidth={1.75} />
          <span className="mobile-nav__label">Inbox</span>
        </button>

        <button
          className={`mobile-nav__tab ${activePage === 'events' ? 'mobile-nav__tab--active' : ''}`}
          onClick={handleEvents}
        >
          <CalendarClock size={22} strokeWidth={1.75} />
          <span className="mobile-nav__label">Events</span>
        </button>

        <button
          className={`mobile-nav__tab ${activePage === 'projects' ? 'mobile-nav__tab--active' : ''}`}
          onClick={handleProjects}
        >
          <FolderKanban size={22} strokeWidth={1.75} />
          <span className="mobile-nav__label">Projects</span>
        </button>

        <button
          className={`mobile-nav__tab ${activePage === 'maintenance' ? 'mobile-nav__tab--active' : ''}`}
          onClick={handleMaintenance}
        >
          <Wrench size={22} strokeWidth={1.75} />
          <span className="mobile-nav__label">Maintenance</span>
        </button>
      </nav>
    </>
  )
}
