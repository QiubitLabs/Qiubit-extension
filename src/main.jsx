// Load polyfills first (must be before any other imports that use them)
import './utils/polyfills.js'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/shared/ErrorBoundary'

// Polyfill Buffer for browser (required by crypto libraries)
import { Buffer } from 'buffer'
window.Buffer = Buffer

// Extension-specific: Ensure global is defined
if (typeof global === 'undefined') {
  window.global = window
}

const root = document.getElementById('root')

if (!root) {
  console.error('[Main] Root element not found!')
} else {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
  console.log('[Main] Qiubit mounted successfully')
}
