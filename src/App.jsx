import { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from './firebase'
import { useAutoReset } from './hooks/useAutoReset'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import Dashboard from './pages/Dashboard'
import TackleList from './pages/TackleList'
import Checklists from './pages/Checklists'
import Meetings from './pages/Meetings'
import Inbox from './pages/Inbox'
import Projects from './pages/Projects'
import Events from './pages/Events'
import Maintenance from './pages/Maintenance'
import './App.css'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

export default function App() {
  useAutoReset()
  const isMobile                            = useIsMobile()
  const [activeView, setActiveView]         = useState('weekly')
  const [firebaseStatus, setFirebaseStatus] = useState('checking')
  const [projectFocus, setProjectFocus]         = useState(null) // { id } — set when navigating in from a dashboard task
  const [eventFocus, setEventFocus]             = useState(null) // { id, tab } — set when navigating in from a dashboard event/task
  const [maintenanceFocus, setMaintenanceFocus] = useState(null) // { id } — set when navigating in from dashboard

  // Mobile always starts on tackle, desktop on dashboard
  const [activePage, setActivePage] = useState(() =>
    window.innerWidth < 768 ? 'tackle' : 'dashboard'
  )

  useEffect(() => {
    async function checkFirestore() {
      try {
        await getDocs(collection(db, '_connection_check'))
        setFirebaseStatus('ok')
      } catch (err) {
        console.error('Firestore connection error:', err)
        setFirebaseStatus('error')
      }
    }
    checkFirestore()
  }, [])

  const handleNavigate = (page) => {
    setActivePage(page)
    if (page === 'checklists' && activePage !== 'checklists') {
      setActiveView('weekly')
    }
  }

  const handleNavigateToProject = (projectId) => {
    setProjectFocus({ id: projectId })
    handleNavigate('projects')
  }

  const handleNavigateToEvent = (eventId, tab = 'tasks') => {
    setEventFocus({ id: eventId, tab })
    handleNavigate('events')
  }

  const handleNavigateToMaintenance = (issueId) => {
    setMaintenanceFocus({ id: issueId })
    handleNavigate('maintenance')
  }

  // Mobile pages: tackle + checklists only
  // If somehow on dashboard on mobile, redirect to tackle
  const effectivePage = isMobile && activePage === 'dashboard' ? 'tackle' : activePage

  return (
    <div className={`app-shell ${isMobile ? 'app-shell--mobile' : ''}`}>
      {!isMobile && (
        <Sidebar
          activePage={effectivePage}
          activeView={activeView}
          onNavigate={handleNavigate}
          onViewChange={setActiveView}
        />
      )}

      <main className="main-content">
        {firebaseStatus === 'error' && (
          <div className="firebase-banner">
            <span className="mono">⚠ Firestore connection failed — check Firebase config</span>
          </div>
        )}
        {effectivePage === 'dashboard'  && (
          <Dashboard
            onNavigate={handleNavigate}
            onViewChange={setActiveView}
            onNavigateToProject={handleNavigateToProject}
            onNavigateToEvent={handleNavigateToEvent}
            onNavigateToMaintenance={handleNavigateToMaintenance}
          />
        )}
        {effectivePage === 'tackle'     && <TackleList />}
        {effectivePage === 'checklists' && <Checklists activeView={activeView} />}
        {effectivePage === 'meetings'   && <Meetings />}
        {effectivePage === 'inbox'      && <Inbox />}
        {effectivePage === 'projects'   && (
          <Projects
            projectFocus={projectFocus}
            onClearProjectFocus={() => setProjectFocus(null)}
          />
        )}
        {effectivePage === 'events'     && (
          <Events
            eventFocus={eventFocus}
            onClearEventFocus={() => setEventFocus(null)}
          />
        )}
        {effectivePage === 'maintenance' && (
          <Maintenance
            maintenanceFocus={maintenanceFocus}
            onClearMaintenanceFocus={() => setMaintenanceFocus(null)}
          />
        )}
      </main>

      {isMobile && (
        <MobileNav
          activePage={effectivePage}
          activeView={activeView}
          onNavigate={handleNavigate}
          onViewChange={setActiveView}
        />
      )}
    </div>
  )
}
