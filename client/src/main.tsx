import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { installVisibilityAwareTimers } from './utils/visibilityPolling'

// Pause all component polling while the tab is hidden (before any component
// schedules its interval).
installVisibilityAwareTimers()

// Legacy role rename: the stored role is now 'Specialist'. Upgrade any cached
// session so menu/route role checks keep working without a re-login.
try {
  const raw = localStorage.getItem('sretan_user')
  if (raw) {
    const u = JSON.parse(raw)
    if (u && u.role === 'Consultant') {
      u.role = 'Specialist'
      localStorage.setItem('sretan_user', JSON.stringify(u))
    }
  }
} catch {}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
