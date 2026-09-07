import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fonts are bundled rather than fetched from a CDN: this app is meant to run
// offline, and in Electron there is no guarantee of a network at all.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans-condensed/600.css'
import '@fontsource/ibm-plex-sans-condensed/700.css'
import '@fontsource/ibm-plex-mono/400.css'

import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
