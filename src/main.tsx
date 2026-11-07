import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { missingConfig } from './lib/firebaseConfig'

const root = createRoot(document.getElementById('root')!)

if (missingConfig.length) {
  // Without the Firebase config nothing can work; say exactly what's missing
  // instead of letting the Firebase SDK fail with a cryptic error.
  root.render(
    <main className="center stack">
      <h1>Workouts</h1>
      <p>Firebase isn't configured. Missing environment variables:</p>
      <ul>
        {missingConfig.map((k) => (
          <li key={k}>
            <code>{k}</code>
          </li>
        ))}
      </ul>
      <p className="muted">Set them in .env.local (local) or in the Vercel project settings, then rebuild.</p>
    </main>,
  )
} else {
  // Loaded only when configured, so Firebase initializes with a valid config.
  void import('./App.tsx').then(({ default: App }) =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
}
