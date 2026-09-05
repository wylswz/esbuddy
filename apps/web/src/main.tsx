import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './i18n'
import { captureAuthToken } from './auth.ts'
import { captureInviteToken } from './invite.ts'

// Persist a share-invite token (if any) before the OAuth redirect drops the
// query string, then persist an OAuth redirect token (if any) before boot.
captureInviteToken()
captureAuthToken()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
