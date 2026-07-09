import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

if (window.location.hostname === '127.0.0.1') {
  const localUrl = new URL(window.location.href)
  localUrl.hostname = 'localhost'
  window.location.replace(localUrl.toString())
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
