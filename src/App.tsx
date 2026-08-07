import { useCallback, useEffect, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { api } from './api'
import type { Professor, Session, User } from './types'
import { AuthScreen } from './features/auth/AuthScreen'
import { AdminPage } from './features/admin/AdminPage'
import { Workspace } from './features/workspace/Workspace'
import './linear.css'

const SESSION_KEY = 'miyagi.session'

function storedSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null } catch { return null }
}

export default function App() {
  const isAdminPath = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')
  const [session, setSession] = useState<Session | null>(storedSession)
  const saveSession = useCallback((next: Session | null) => {
    setSession(next)
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    else localStorage.removeItem(SESSION_KEY)
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    const result = url.searchParams.get('github_oauth')
    const token = url.searchParams.get('github_login_token')
    if (!result && !token) {
      api<Session>('/auth/session').then(saveSession).catch(() => saveSession(null))
      return
    }

    if (result === 'student_connected' && token) {
      api<User>(`/auth/student/github/session?token=${encodeURIComponent(token)}`)
        .then((user) => { saveSession({ role: 'student', user }); toast.success('Signed in with GitHub') })
        .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'GitHub sign-in failed'))
    } else if (result === 'professor_connected' && token) {
      api<Professor>(`/auth/professor/github/session?token=${encodeURIComponent(token)}`)
        .then((professor) => { saveSession({ role: 'professor', professor, displayName: professor.user?.displayName ?? 'Professor' }); toast.success('Signed in with GitHub') })
        .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'GitHub sign-in failed'))
    } else if (result === 'connected') toast.success('GitHub connected')
    else toast.error(oauthMessage(result))

    url.searchParams.delete('github_oauth')
    url.searchParams.delete('github_login_token')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [saveSession])

  return <>
    <Toaster theme="light" position="bottom-right" richColors closeButton />
    {session && isAdminPath ? <AdminPage session={session} onLogout={() => {
      void api('/auth/logout', { method: 'POST' }).finally(() => saveSession(null))
    }} /> : session ? <Workspace session={session} onLogout={() => {
      void api('/auth/logout', { method: 'POST' }).finally(() => saveSession(null))
    }} /> : <AuthScreen admin={isAdminPath} />}
  </>
}

function oauthMessage(result: string | null) {
  const messages: Record<string, string> = {
    missing_config: 'GitHub sign-in is not configured.', denied: 'GitHub authorization was cancelled.',
    invalid_state: 'The GitHub request expired. Try again.', token_exchange_failed: 'GitHub rejected the authorization request.',
    profile_fetch_failed: 'Miyagi could not read your GitHub profile.', github_account_in_use: 'That GitHub account is already connected.',
    professor_account_conflict: 'That GitHub account already has a different Miyagi role.',
    unauthorized_professor: 'This GitHub account is not authorized as a professor.',
  }
  return messages[result ?? ''] ?? 'GitHub sign-in did not complete.'
}
