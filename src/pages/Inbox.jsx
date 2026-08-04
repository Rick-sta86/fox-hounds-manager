import { Mail } from 'lucide-react'
import './Inbox.css'

export default function Inbox() {
  return (
    <div className="inbox-page">
      <header className="inbox-page-header">
        <div className="inbox-page-header-inner">
          <h1 className="inbox-page-title">
            <Mail size={26} strokeWidth={1.75} />
            Inbox
          </h1>
          <p className="inbox-page-sub mono">Coming soon</p>
        </div>
      </header>
    </div>
  )
}
